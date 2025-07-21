from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import string
import nltk
import numpy as np
import os
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# Safely download stopwords
try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

app = Flask(__name__)
CORS(app)

# Load the sentence transformer model
model_embed = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

# Function to preprocess text
def preprocess_text(text):
    marathi_stopwords = set([
        "आहे", "कसे", "नाही", "मध्ये", "हे", "त्या", "कधी", "पण", "होते",
        "मी", "आणि", "त्यामुळे", "का", "काय", "कुठे"
    ])
    text = text.translate(str.maketrans('', '', string.punctuation))
    tokens = text.split()
    tokens = [word for word in tokens if word not in marathi_stopwords]
    return ' '.join(tokens)

# Load and preprocess dataset
try:
    df = pd.read_excel("Bhagavad_Gita_Updated_Merged.xlsx")
    df.columns = df.columns.str.strip().str.lower()
    required_columns = ["problem", "shloka_combined"]
    if not all(col in df.columns for col in required_columns):
        raise KeyError(f"Missing one of the required columns: {required_columns}")

    df_cleaned = df.dropna(subset=required_columns)
    problems = df_cleaned["problem"].astype(str).tolist()
    shlokas = df_cleaned["shloka_combined"].astype(str).tolist()
    processed_texts = [preprocess_text(text) for text in problems]

    embeddings = model_embed.encode(processed_texts, show_progress_bar=True)

except FileNotFoundError:
    print("❌ Error: Bhagavad_Gita_Updated_Merged.xlsx file not found")
    raise
except KeyError as e:
    print(f"❌ Error: {e}")
    raise

# Recommendation API
@app.route("/recommend", methods=["POST"])
def recommend():
    data = request.json
    user_problem = data.get("problem", "")
    if not user_problem.strip():
        return jsonify({"error": "Empty input"}), 400

    processed_input = preprocess_text(user_problem)
    input_embedding = model_embed.encode([processed_input])
    similarities = cosine_similarity(input_embedding, embeddings)[0]
    top_indices = np.argsort(similarities)[::-1][:5]

    def format_shloka_output(idx):
        return {
            "Shloka": shlokas[idx],
            "Solution": "💡 ही श्लोक मनाच्या शांतीसाठी आणि आत्मनियंत्रणासाठी मार्गदर्शन करते.",
            "Similarity": round(float(similarities[idx]), 4)
        }

    main_idx = top_indices[0]
    main_rec = {
        "Problem": user_problem,
        **format_shloka_output(main_idx)
    }

    other_recs = [format_shloka_output(idx) for idx in top_indices[1:]]

    return jsonify({
        "Main_Recommendation": main_rec,
        "Other_Recommendations": other_recs
    })

# Health check route
@app.route("/", methods=["GET"])
def home():
    return "🕉️ Bhagavad Gita Shloka Recommender is running."

# Main entry point with Railway-compatible port
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
