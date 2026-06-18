import os
import re
import json
import random
import time
import datetime
from functools import wraps
import numpy as np

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from authlib.integrations.flask_client import OAuth
from openai import OpenAI

# 1. Core NLP & Preprocessing Libraries (NLTK)
import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer

# 2. Core Machine Learning & Naive Bayes Libraries (Scikit-Learn)
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import make_pipeline
from dotenv import load_dotenv

load_dotenv()

# Ensure necessary NLTK components are locally available
for dependency in ['tokenizers/punkt', 'corpora/stopwords', 'corpora/wordnet', 'corpora/punkt_tab']:
    try:
        nltk.data.find(dependency)
    except LookupError:
        download_target = dependency.split('/')[-1]
        nltk.download(download_target)

# ------------------ ENVIRONMENT SETUP ------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CHATBOT = Flask(__name__, static_folder="static", template_folder='templates')

CHATBOT.secret_key = os.getenv("SECRET_KEY", "dev-key")

# Note: The AI Studio hosting environment runs on HTTPS and requires SameSite="None" and Secure=True 
# to support cookie persistence inside the preview iframe. However, local localhost development 
# typically runs on plain HTTP, where Secure/SameSite="None" causes browsers to drop session cookies 
# and raise persistent 401 errors.
# We solve this by automatically detecting the environment:
is_cloud_env = (
    os.getenv("K_SERVICE") is not None or 
    "run.app" in os.getenv("APP_URL", "") or 
    os.getenv("PORT") == "3000" or
    "GOOGLE_CLOUD_PROJECT" in os.environ
)
default_secure_cookies = "true" if is_cloud_env else "false"
use_secure_cookies = os.getenv("SECURE_COOKIES", default_secure_cookies).lower() == "true"

CHATBOT.config.update(
    SECRET_KEY=os.getenv("SECRET_KEY", "dev-key"),
    SESSION_COOKIE_SAMESITE="None" if use_secure_cookies else "Lax",
    SESSION_COOKIE_SECURE=use_secure_cookies
)
oauth = OAuth(CHATBOT)

google = oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    access_token_url='https://oauth2.googleapis.com/token',
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile'
    },
    authorize_params=None
)

# AI API Initialization helper to prevent startup crashes when API keys are not set locally
client_instance = None

def get_openai_client():
    global client_instance
    if client_instance is None:
        api_key = os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("API Key not found. Please set OPENAI_API_KEY or GEMINI_API_KEY in your environment.")
        client_instance = OpenAI(api_key=api_key)
    return client_instance

# Fixed Absolute File Paths
DATA_FILE_PATH = os.path.join(BASE_DIR, "DATA.json")
CHAT_FILE = os.path.join(BASE_DIR, "memory.json")
UNKNOWN_FILE = os.path.join(BASE_DIR, "unknown.json")  # Logged failed queries
LEARNED_PATTERNS_FILE = os.path.join(BASE_DIR, "learned_patterns.json")  # Approved active chatbot guidelines

# Global data containers for intents and technical categories
data = {}
intents = []
categ = {}

# Initialize NLTK structures
lemmatizer = WordNetLemmatizer()  # Converts words to their base form
stop_words = set(stopwords.words('english'))
stop_words.update({"want", "learn", "teach", "show", "explain", "about", "tell", "course", "please", "code", "example"})

# Global Machine Learning Pipeline variable
ml_classifier_pipeline = None 

from sentence_transformers import SentenceTransformer, util
semantic_model = SentenceTransformer('all-MiniLM-L6-v2')

topic_embeddings = []
topic_metadata = []

# ------------------ NLP PREPROCESSING PIPELINE ------------------

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    return text.strip()

def custom_nltk_tokenizer(text):
    """
    NLP Preprocessing: Tokenizes, cleans punctuation, filters stop-words, 
    and applies lemmatization to extract stable root words.
    """
    if not text:
        return []
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    raw_tokens = word_tokenize(text)
    
    cleaned_tokens = []
    for token in raw_tokens:
        if token not in stop_words and len(token) > 1:
            lemma = lemmatizer.lemmatize(token)
            cleaned_tokens.append(lemma)
    return cleaned_tokens

# ------------------ MACHINE LEARNING TRAINING ------------------

def train_naive_bayes_model():
    """
    Model Training Layer: Extracts text patterns, pairs them with intent categories,
    and trains a Scikit-Learn Multinomial Naive Bayes Pipeline on startup.
    """
    global ml_classifier_pipeline, intents
    
    training_sentences = []
    training_labels = []
    
    for intent in intents:
        tag = intent.get("tag")
        patterns = intent.get("patterns", [])
        for pattern in patterns:
            training_sentences.append(pattern)
            training_labels.append(tag)
            
    if training_sentences and training_labels:
        ml_classifier_pipeline = make_pipeline(
            TfidfVectorizer(tokenizer=custom_nltk_tokenizer, token_pattern=None, lowercase=False),
            MultinomialNB(alpha=1.0)
        )
        ml_classifier_pipeline.fit(training_sentences, training_labels)
        print("🚀 Naive Bayes Classifier trained successfully using Scikit-Learn!")
    else:
        ml_classifier_pipeline = None

# ------------------ DATA SYSTEM HANDLERS ------------------
def safe_load_json(file_path):
    try:
        if not os.path.exists(file_path):
            return []
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return []
            return json.loads(content)
    except Exception as e:
        print(f"Error reading JSON from {file_path}: {e}")
        return []

def learn_from_unknown():
    global intents, ml_classifier_pipeline

    if not os.path.exists(UNKNOWN_FILE):
        return

    unknowns = safe_load_json(UNKNOWN_FILE)
    if not unknowns:
        return

    for item in unknowns:
        # Compatibility handling for legacy flat query format
        question = item.get("question") or item.get("query")
        if not question:
            continue

        intents.append({
            "tag": "learned_unknown",
            "patterns": [question],
            "responses": ["I'm learning this topic. Let me improve!"]
        })

    # Retrain full model
    train_naive_bayes_model()

def load_data():
    global data, intents, categ, topic_embeddings, topic_metadata
    try:
        with open(DATA_FILE_PATH, "r", encoding="utf-8") as f:
             content = f.read().strip()
             if not content:
                  raise ValueError("DATA.json is empty!")
             data = json.loads(content)

        intents = data.get("intents", [])
        categ = data.get("categories", {})

        # Correctly clear structures BEFORE loop so topics are aggregate-preserved!
        topic_embeddings.clear()
        topic_metadata.clear()

        for cat_name, cat_content in categ.items():
            if isinstance(cat_content, dict):
                for level_key, level_val in cat_content.items():
                    if isinstance(level_val, dict) and "topics" in level_val:
                        for topic in level_val.get("topics", []):
                            title = topic.get("title", "")
                            intro = topic.get("intro", "")
                            combined_text = f"{title} {intro}"
                            embedding = semantic_model.encode(combined_text)
                            
                            topic_embeddings.append(embedding)
                            topic_metadata.append((cat_name, level_key, topic))

        print("✅ Data loaded successfully from DATA.json")
        learn_from_unknown()  # Load any previously unknown questions into the model
    except Exception as e:
        print(f"❌ Error loading data: {e}")

def load_chat_history():
    if 'history' not in session:
        session['history'] = []
    return session['history']

def save_chat_history(chats):
    session['history'] = chats
    session.modified = True  

# Initial system dataset boot load
load_data()

def get_char_ngrams(text, n=3):
    """Breaks text into small letter combinations to tolerate typos."""
    text = f" {text.strip()} "
    return set(text[i:i+n] for i in range(len(text) - n + 1))

def check_semantic_similarity(user_msg, target_strings, threshold=0.22):
    """Checks if the user's input closely overlaps with any targeted strings or patterns."""
    user_grams = get_char_ngrams(user_msg)
    
    for target in target_strings:
        clean_target = target.lower().strip().replace("?", "").replace(",", "")
        target_grams = get_char_ngrams(clean_target)
        
        intersection = user_grams.intersection(target_grams)
        union = user_grams.union(target_grams)
        
        if union:
            similarity = len(intersection) / len(union)
            if similarity >= threshold:
                return True
    return False

def semantic_search(user_query, threshold=0.55):
    if not topic_embeddings:
        return None

    query_embedding = semantic_model.encode(user_query)
    best_score = 0
    best_match = None

    for i, emb in enumerate(topic_embeddings):
        score = util.cos_sim(query_embedding, emb).item()
        if score > best_score:
            best_score = score
            best_match = topic_metadata[i]

    if best_score >= threshold:
        return best_match

    return None

# ------------------ ADAPTIVE DYNAMIC LEARNING MODULES ------------------

def load_learned_patterns():
    return safe_load_json(LEARNED_PATTERNS_FILE)

def save_learned_patterns(patterns):
    try:
        with open(LEARNED_PATTERNS_FILE, "w", encoding="utf-8") as f:
            json.dump(patterns, f, indent=2)
    except Exception as e:
        print("Error saving learned patterns:", e)

def get_normalized_unknown_logs():
    raw_logs = safe_load_json(UNKNOWN_FILE)
    normalized = []
    for item in raw_logs:
        if not isinstance(item, dict):
            continue
        # Map flat legacy structure safely to rich logged anomalous structure
        if "question" in item and "query" not in item:
            normalized.append({
                "id": "log_" + str(int(time.time() * 1000)) + "_" + str(random.randint(100, 999)),
                "query": item["question"],
                "response": "No response received",
                "category": "out_of_scope",
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                "status": "pending"
            })
        elif "query" in item:
            normalized.append(item)
    return normalized

def save_unknown_logs(logs):
    try:
        with open(UNKNOWN_FILE, "w", encoding="utf-8") as f:
            json.dump(logs, f, indent=2)
    except Exception as e:
        print("Error saving unknown query logs:", e)

def check_learned_pattern_match(user_query):
    patterns = load_learned_patterns()
    user_query_clean = user_query.lower().strip()
    
    # Precise match receptor lookup
    for p in patterns:
        trigger = p.get("pattern", "").lower().strip()
        # Direct keyword inclusion or close keyword overlap provides instant response
        if trigger in user_query_clean or user_query_clean in trigger:
            return p.get("responseMarkdown")
    return None

# ------------------ CHATBOT RESPONSE ENGINE ------------------

def get_bot_response(user_message, database_json):
    """
    Precision-Ordered Retrieval Engine: Preserves your original lookups perfectly.
    """
    global ml_classifier_pipeline, intents
    user_query = user_message.lower().strip()
    fallback_response = "hey👋!.. can you ask something related to my knowledge... i am happy to give you answers 🥰"
    
    if isinstance(database_json, list) and len(database_json) > 4:
        root_data = database_json[0]
    else:
        root_data = database_json

    if user_query in ["python", "learn python", "teach me python"]:
        return "### 🐍 Python Track Active\nPython is a powerful, high-level language focused on code readability. Try asking me specific concepts like:\n* 👉 *'python syntax and indentation'*\n* 👉 *'list and sequence mastery'*\n* 👉 *'dictionaries and mapping'*"
    
    if user_query in ["java", "learn java", "i want to learn java"]:
        return "### ☕ Java Track Active\nJava is a strongly-typed, object-oriented language used worldwide. Try asking me specific concepts like:\n* 👉 *'objects and classes'*\n* 👉 *'conditional logic'*\n* 👉 *'loops and iteration'*"

    if user_query in ["c", "c programming", "what about c programming"]:
        return "### 💻 C Track Active\nC is a foundational system-level language that gives you complete power over memory allocation. Try asking me about:\n* 👉 *'memory management'*\n* 👉 *'arrays and collections'*"

    if ml_classifier_pipeline is not None:
        try:
            predicted_tag = ml_classifier_pipeline.predict([user_message])[0]
            probabilities = ml_classifier_pipeline.predict_proba([user_message])[0]
            
            if np.max(probabilities) > 0.30:
                     for intent in intents:
                             if intent.get("tag") == predicted_tag:
                                 return random.choice(intent.get("responses"))
        except Exception as e:
            print(f"⚠️ ML optimization bypass: {e}")

    intents_list = root_data.get("intents", [])
    for intent in intents_list:
        if intent.get("tag") in ["greeting", "help", "goodbye", "thanks", "response"]:
            pattern = intent.get("patterns", [])
            if check_semantic_similarity(user_query, pattern, threshold=0.22):
                return random.choice(intent.get("responses", [fallback_response]))

    all_categories = root_data.get("categories", {})
    for category_track_name, category_content in all_categories.items():
        if not isinstance(category_content, dict):
            continue
            
        if f"history of {category_track_name.lower()}" in user_query or (category_track_name.lower() in user_query and "history" in user_query):
            return f"# 📜 History of {category_track_name}\n{category_content.get('history')}"

        for level_key, level_value in category_content.items():
            if isinstance(level_value, dict) and "topics" in level_value:
                topics_list = level_value.get("topics", [])
                
                for topic in topics_list:
                    title = topic.get("title", "").lower()
                    intro = topic.get("intro", "").lower()
                    
                    search_matrix = [title, intro]
                    
                    if (check_semantic_similarity(user_query, search_matrix, threshold=0.22) or
                        title in user_query or user_query in title):
                        
                        raw_explanation = topic.get("explanation", "")
                        
                        code_blocks = ""
                        examples = topic.get("code_examples") or []
                        for example in examples:
                            lang_tag = "python" if "python" in category_track_name.lower() else "c"
                            code_blocks += f"\n\`\`\`{lang_tag}\n{example}\n\`\`\`\n"
                        
                        formatted_response = (
                            f"# 🚀 Topic Found: {topic.get('title').title()}\n"
                            f"**Track:** {category_track_name.title()} — [{level_key}]\n\n"
                            f"**Introduction:** *{topic.get('intro')}*\n\n"
                            f"### 📘 Conceptual Breakdown:\n{raw_explanation}\n"
                        )
                        if code_blocks:
                            formatted_response += f"\n### 💻 Applied Code Sandbox:{code_blocks}"
                            
                        return formatted_response

    # Semantic Fallback using embeddings similarity
    semantic_result = semantic_search(user_query)
    if semantic_result:
         category_name, level_key, topic = semantic_result
         raw_explanation = topic.get("explanation", "")
         intro = topic.get("intro", "")

         return (
             f"# 🧠 Semantic Match Found: {topic.get('title')}\n"
             f"**Track:** {category_name} — [{level_key}]\n\n"
             f"*{intro}*\n\n{raw_explanation}"
          )

    # FINAL fallback → AI API + Adaptive Logic safely protected from NoneType crash
    ai_response = get_ai_response(user_message)
    if ai_response and "❌" not in ai_response:
        return ai_response
    else:
        return fallback_response

#-------AI API callback
def get_ai_response(prompt):
    try:
        print("🔥 AI API CALLED with:", prompt)
        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content
    except Exception as e:
        print("❌ AI ERROR:", e)
        return None

#------------------ COMBINATORIAL SUPERVISOR LAYER ------------------

def extract_languages(text, categories_dict):
    text = text.lower()
    found = []
    for cat in categories_dict.keys():
         if re.search(rf"\b{cat.lower()}\b", text):
            found.append(cat)
    return found

def extract_topics(text):
    keywords = ["loop", "loops", "function", "functions", "data type", "data types", "array", "arrays", "pointer", "pointers"]
    text = text.lower()
    found = []
    for k in keywords:
        if k in text:
            found.append(k)
    return found

def process_combined_multi_queries(user_message, database_json):
    clean_msg = user_message.lower().strip()

    # Fast-track simple statements
    if clean_msg in ["hi", "hello", "hey", "hello!", "hi!"]:
        return get_bot_response(user_message, database_json)

    # Normalize DB structure
    root_data = database_json[0] if isinstance(database_json, list) else database_json
    all_categories = root_data.get("categories", {})

    found_sections = []
    words = clean_msg.split()

    topic_keywords = []
    for word in words:
        if word in ["loop", "loops", "function", "functions", "variable", "variables"]:
            topic_keywords.append(word)

    languages = []
    for word in words:
        if word in ["python", "java", "c", "cpp"]:
            languages.append(word)

    # Scan database properly
    for cat_name, cat_content in all_categories.items():
        if not isinstance(cat_content, dict):
            continue

        for level_key, level_val in cat_content.items():
            if isinstance(level_val, dict) and "topics" in level_val:
                for topic in level_val.get("topics", []):
                    title = topic.get("title", "").lower()

                    topic_match = any(k in title for k in topic_keywords)
                    lang_match = True
                    if languages:
                        lang_match = any(lang in title for lang in languages)

                    if topic_match and lang_match:
                        found_sections.append(topic)

    unique_sections = []
    seen_titles = set()
    for topic in found_sections:
        t = topic.get("title", "")
        if t not in seen_titles:
            unique_sections.append(topic)
            seen_titles.add(t)

    unique_sections = unique_sections[:5]

    if unique_sections:
        response_parts = ["# 🚀 Combined Learning Results"]
        for topic in unique_sections:
            title = topic.get('title', 'Topic').title()
            intro = topic.get('intro', '')
            explanation = topic.get('explanation', '')

            part = f"\n### 📘 {title}\n*{intro}*\n{explanation}\n"
            examples = topic.get("code_examples", [])
            if examples:
                code_blocks = ""
                for example in examples:
                    lang_tag = "python" if "python" in title.lower() else "c"
                    code_blocks += f"\n\`\`\`{lang_tag}\n{example}\n\`\`\`\n"
                part += f"\n### 💻 Code Example:\n{code_blocks}"
            response_parts.append(part)

        return "\n---\n".join(response_parts)

    return get_bot_response(user_message, database_json) 

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user" not in session:
            return jsonify({"error": "Unauthorized access"}), 401
        return f(*args, **kwargs)
    return decorated_function 

# ------------------ FLASK WEB ROUTING ENDPOINTS ------------------

@CHATBOT.route("/")
def home():
    if "user" not in session:
        return redirect("/login")
    return render_template("index.html")

@CHATBOT.route("/login")
def login_page():
    return render_template("login.html")

@CHATBOT.route("/login", methods=["POST"])
def login():
    data_req = request.json
    if data_req['username'] == "admin" and data_req['password'] == "123":
        session['user'] = data_req['username']
        return jsonify({"message": "success"})
    return jsonify({"error": "invalid credentials"})

@CHATBOT.route("/google-login")
def google_login():
    redirect_uri = url_for('callback', _external=True)
    return google.authorize_redirect(redirect_uri)
    
@CHATBOT.route("/callback")
def callback():
    try:
        token = google.authorize_access_token()
        user_info = google.get('https://www.googleapis.com/oauth2/v2/userinfo').json()
        session['user'] = user_info['email']
        return redirect(url_for('home'))
    except Exception as e:
        return f"OAuth Error: {str(e)}"

@CHATBOT.route("/logout")
def logout():
    session.clear()
    return redirect("/login")    

@CHATBOT.route("/get_chats", methods=["GET"])
@login_required
def get_chats(): 
    return jsonify(load_chat_history())

@CHATBOT.route("/save_chat", methods=["POST"])
@login_required
def save_chat():
    try:
        req_data = request.get_json() or {}
        chat_name = req_data.get("name", "").strip()
        messages = req_data.get("messages", [])
        
        if not chat_name:
            return jsonify({"status": "error", "message": "Missing required text tracking name"}), 400

        chats = load_chat_history()
        for chat in chats:
            if chat.get("name", "").strip() == chat_name:
                chat["messages"] = messages
                save_chat_history(chats)
                return jsonify({"status": "saved", "name": chat_name})
                
        chats.append({"name": chat_name, "messages": messages})
        save_chat_history(chats)
        return jsonify({"status": "saved", "name": chat_name})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@CHATBOT.route("/delete-chat", methods=["POST"])
@login_required
def delete_chat():
    try:
        req_data = request.get_json() or {}
        chat_name = req_data.get("chat_name", "").strip()
        
        if not chat_name:
            return jsonify({"success": False, "message": "Missing routing index data"}), 400
            
        chats = load_chat_history()
        updated_chats = [c for c in chats if c.get("name", "").strip() != chat_name]
        
        save_chat_history(updated_chats)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@CHATBOT.route("/get", methods=["POST"])
@login_required
def chatbot_api():
    try:
        if not request.is_json:
            return jsonify({"response": "❌ Incompatible data delivery format"}), 400
            
        req_data = request.get_json()
        user_message = req_data.get("message", "").strip()
        chat_name = req_data.get("chat_name", "").strip()

        if not user_message:
            return jsonify({"response": "Please type a message 📝"})

        chats = load_chat_history()
        
        # 1. Check dynamic learning memory first for approved pattern bypasses
        learned_response = check_learned_pattern_match(user_message)
        
        if learned_response:
            bot_response = learned_response
            is_fallback = False
        else:
            bot_response = process_combined_multi_queries(user_message, data)
            
            # Detect fallback responses from chatbot lookup logic
            lower_res = bot_response.lower()
            is_fallback = (
                "related to my knowledge" in lower_res or 
                "happy to give you answers" in lower_res or 
                "ask something related" in lower_res or 
                "can you ask something related" in lower_res
            )
            
            # Auto-log fallback/API failure as a pending intercept log item
            if is_fallback:
                try:
                    logs = get_normalized_unknown_logs()
                    # Check duplication
                    if not any(l.get("query", "").lower().strip() == user_message.lower().strip() for l in logs):
                        new_log = {
                            "id": f"log_{int(time.time() * 1000)}_{random.randint(100, 999)}",
                            "query": user_message,
                            "response": bot_response,
                            "category": "out_of_scope",
                            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                            "status": "pending"
                        }
                        logs.insert(0, new_log)
                        save_unknown_logs(logs)
                except Exception as log_err:
                    print("Error auto-logging query exception:", log_err)

        final_chat_name = chat_name
        if chat_name.startswith("New Chat Thread") or chat_name == "Default Chat":
            words = user_message.split()
            final_chat_name = " ".join(words[:4])
            if (len(words) == 1 and words[0].lower() in ["hi", "hello", "hey", "hello!"]) or len(words) > 20:
                final_chat_name = "General Discussion"
            else:
                final_chat_name = " ".join(words[:4])
                if len(words) > 20:
                    final_chat_name += "..."
           
            existing_names = [c.get("name", "").strip() for c in chats]
            if final_chat_name in existing_names:
                final_chat_name += f" ({random.randint(10,99)})"

        chat_found = False
        for chat in chats:
            if chat.get("name", "").strip() == chat_name:
                chat["name"] = final_chat_name
                if "messages" not in chat: 
                    chat["messages"] = []
                chat["messages"].append({"user": user_message})
                chat["messages"].append({"bot": bot_response})
                chat_found = True
                break

        if not chat_found:
            chats.append({
                "name": final_chat_name,
                "messages": [{"user": user_message}, {"bot": bot_response}]
            })

        save_chat_history(chats)
        return jsonify({
            "response": bot_response, 
            "updated_chat_name": final_chat_name,
            "intercepted": is_fallback
        })
    except Exception as e:
        return jsonify({"response": f"❌ Flask Pipeline Route Anomaly: {str(e)}"})

# ------------------ ADAPTIVE SYSTEM ROUTING ENDPOINTS [NEW] ------------------

@CHATBOT.route("/api/learning", methods=["GET"])
@login_required
def get_learning_rules():
    try:
        logs = get_normalized_unknown_logs()
        patterns = load_learned_patterns()
        return jsonify({
            "logs": logs,
            "patterns": patterns
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@CHATBOT.route("/api/learning/report", methods=["POST"])
@login_required
def manual_flag_unmet():
    try:
        req_data = request.get_json() or {}
        query = req_data.get("query", "").strip()
        response = req_data.get("response", "").strip()
        
        if not query:
            return jsonify({"error": "Query label is required"}), 400
            
        logs = get_normalized_unknown_logs()
        
        # Guard duplication
        if any(l.get("query", "").lower() == query.lower() and l.get("status") == "pending" for l in logs):
            return jsonify({"success": True, "message": "Already queued"})
            
        new_log = {
            "id": f"log_{int(time.time() * 1000)}_{random.randint(100, 999)}",
            "query": query,
            "response": response or "No response received",
            "category": "user_flagged",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "status": "pending"
        }
        logs.insert(0, new_log)
        save_unknown_logs(logs)
        return jsonify({"success": True, "log": new_log})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@CHATBOT.route("/api/learning/suggest", methods=["POST"])
@login_required
def draft_ai_suggestion():
    try:
        req_data = request.get_json() or {}
        log_id = req_data.get("logId")
        if not log_id:
            return jsonify({"error": "logId parameter required"}), 400
            
        logs = get_normalized_unknown_logs()
        log_index = next((i for i, l in enumerate(logs) if l.get("id") == log_id), None)
        if log_index is None:
            return jsonify({"error": "Log record not found"}), 404
            
        log_item = logs[log_index]
        log_query = log_item.get("query")
        log_response = log_item.get("response")
        
        # Invoke LLM to suggest custom code blocks and breakdown guides
        prompt = f"""
Analyze this failed, out-of-scope, or unanswered query from a developer:
Query: "{log_query}"
Previous System Response: "{log_response}"

As our AI Expert, generate a highly informative, production-ready educational response to help the developer.
Your response must contain a clear title, specify which language/track it is for, design level, conceptual explanation, and complete working syntax in a code sandbox.
You must return only a valid JSON object matching the following structure:
{{
  "pattern": "{log_query.lower()}",
  "title": "{log_query.title()} Mastery Guide",
  "track": "General",
  "level": "Intermediate",
  "responseMarkdown": "The full markdown response. Start with specific emojis (🐍, ☕, 💻), include sections (📘 Conceptual Breakdown, 💻 Applied Code Sandbox) and standard markdown code blocks."
}}
Return ONLY the raw JSON block without markdown formatting or triple backticks.
"""
        response_text = get_ai_response(prompt)
        if not response_text:
            return jsonify({"error": "LLM failed to draft structured pattern response"}), 500
            
        try:
            # Strip triple-backticks if returning markdown JSON wrapper
            cleaned_json = response_text.strip()
            if cleaned_json.startswith("```json"):
                cleaned_json = cleaned_json[7:]
            if cleaned_json.endswith("```"):
                cleaned_json = cleaned_json[:-3]
            cleaned_json = cleaned_json.strip()
            
            suggestion = json.loads(cleaned_json)
        except Exception as e:
            # Fallback on parsing exceptions
            suggestion = {
                "pattern": log_query,
                "title": f"{log_query.title()} Guide",
                "track": "General",
                "level": "Intermediate",
                "responseMarkdown": f"🧠 **Custom learning Receptor**\n\n### 📘 Conceptual Breakdown\n{response_text}"
            }
            
        logs[log_index]["suggestion"] = suggestion
        save_unknown_logs(logs)
        return jsonify({"success": True, "suggestion": suggestion})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@CHATBOT.route("/api/learning/teach", methods=["POST"])
@login_required
def approve_learning_pattern():
    try:
        req_data = request.get_json() or {}
        log_id = req_data.get("logId")
        custom_pattern = req_data.get("customPattern")
        
        if not log_id:
            return jsonify({"error": "logId parameter required"}), 400
            
        logs = get_normalized_unknown_logs()
        log_index = next((i for i, l in enumerate(logs) if l.get("id") == log_id), None)
        if log_index is None:
            return jsonify({"error": "Log record not found"}), 404
            
        pattern_to_save = custom_pattern or logs[log_index].get("suggestion")
        if not pattern_to_save:
            return jsonify({"error": "No suggested pattern to save."}), 400
            
        # Write to final approved memory
        patterns = load_learned_patterns()
        
        # De-duplicate keywords trigger mapping
        exists_idx = next((i for i, p in enumerate(patterns) if p.get("pattern", "").lower().strip() == pattern_to_save.get("pattern", "").lower().strip()), None)
        if exists_idx is not None:
            patterns[exists_idx] = pattern_to_save
        else:
            patterns.insert(0, pattern_to_save)
            
        save_learned_patterns(patterns)
        
        # Mark log as resolved
        logs[log_index]["status"] = "resolved"
        logs[log_index]["suggestion"] = pattern_to_save
        save_unknown_logs(logs)
        
        return jsonify({"success": True, "pattern": pattern_to_save})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@CHATBOT.route("/api/learning/ignore", methods=["POST"])
@login_required
def ignore_log_api():
    try:
        req_data = request.get_json() or {}
        log_id = req_data.get("logId")
        if not log_id:
            return jsonify({"error": "logId required"}), 400
            
        logs = get_normalized_unknown_logs()
        log_idx = next((i for i, l in enumerate(logs) if l.get("id") == log_id), None)
        if log_idx is None:
            return jsonify({"error": "Log index not found"}), 404
            
        logs[log_idx]["status"] = "ignored"
        save_unknown_logs(logs)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
     CHATBOT.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
