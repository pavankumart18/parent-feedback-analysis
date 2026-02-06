
import pandas as pd
import numpy as np
import json
import re
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.feature_extraction import text

# Load data from Feedback.csv (relative to dashboard/code/)
# The file structure is: school_name, city, theme, sentiment, feedback
try:
    df = pd.read_csv('../Feedback.csv')
except FileNotFoundError:
    # Fallback/Debug path
    df = pd.read_csv('c:/Users/admin/Desktop/Nord Anglia/Parent Survey/Feedback.csv')

# Rename columns to match internal logic
df.rename(columns={
    'school_name': 'school_id',
    'theme': 'standardized_theme',
    'feedback': 'verbatim'
}, inplace=True)

# Map Themes if necessary (Dashboard JS expects specific keys)
# theme_map = {
#     'Resources & Capacity': 'Value for Money'
# }
# df['standardized_theme'] = df['standardized_theme'].replace(theme_map)

# Generate Sentiment Scores based on label
def get_score_from_label(label):
    label = str(label).lower()
    if 'very positive' in label: return 2.0
    if 'very negative' in label: return -2.0
    if 'positive' in label: return 1.0
    if 'negative' in label: return -1.0
    return 0.0

df['sentiment_score'] = df['sentiment'].apply(get_score_from_label)

# Ensure city column exists (it should be in Feedback.csv now)
if 'city' not in df.columns:
    df['city'] = 'Global' # Fallback

# --- Helper Functions ---
def calculate_sentiment_score(group):
    """Calculates score using the -2 to +2 scores"""
    if len(group) == 0: return 0
    return round(group['sentiment_score'].mean(), 2)

def extract_key_phrases(text_series, n=3):
    if text_series.empty: return []
    try:
        # Simple stop words + custom
        my_stop_words = list(text.ENGLISH_STOP_WORDS.union(['school', 'students', 'teachers']))
        vec = CountVectorizer(ngram_range=(2,3), stop_words=my_stop_words, max_features=10)
        bow = vec.fit_transform(text_series.astype(str).fillna(''))
        sum_words = bow.sum(axis=0) 
        words_freq = [(word, sum_words[0, idx]) for word, idx in vec.vocabulary_.items()]
        words_freq = sorted(words_freq, key = lambda x: x[1], reverse=True)
        return [w[0] for w in words_freq[:n]]
    except:
        return []

def get_bucket(score):
    if score > 1.0: return "Very Positive"
    if score > 0.05: return "Positive"
    if score < -1.0: return "Very Negative"
    if score < -0.05: return "Negative"
    return "Neutral"

# --- 1. Deep Dive Analysis ---

# A. The "Stability Proxy" (Teacher Quality & Stability)
stability_mask = df['standardized_theme'].astype(str).str.contains("Teacher Quality & Stability")
stability_df = df[stability_mask]
stability_neg = stability_df[stability_df['sentiment'].astype(str).str.lower().str.contains('negative')]
# Count keywords related to "Leaving/Turnover"
turnover_keywords = ['left', 'leaving', 'gone', 'turnover', 'resign', 'new teacher', 'change', 'replacement']
turnover_count = stability_neg['verbatim'].apply(lambda x: any(k in str(x).lower() for k in turnover_keywords)).sum()
turnover_pct = round(turnover_count / len(stability_neg) * 100, 1) if len(stability_neg) > 0 else 0

# B. The "Communication Black Hole" (Parent-Teacher Communication)
comm_mask = df['standardized_theme'].astype(str).str.contains("Parent–Teacher Communication")
comm_df = df[comm_mask]
comm_score = calculate_sentiment_score(comm_df)
# Check for "Response Time" vs "Clarity"
response_keywords = ['reply', 'respond', 'answer', 'email', 'contact']
# Filter negative generally
comm_neg = comm_df[comm_df['sentiment'].astype(str).str.lower().str.contains('negative')]
response_issues = comm_neg['verbatim'].apply(lambda x: any(k in str(x).lower() for k in response_keywords)).sum()

# C. Value for Money Correlation
value_mask = df['standardized_theme'].astype(str).str.contains("Value for Money")
value_df = df[value_mask]
facilities_keywords = ['facilit', 'sport', 'pool', 'gym', 'field', 'campus', 'building']
value_facilities_overlap = value_df['verbatim'].apply(lambda x: any(k in str(x).lower() for k in facilities_keywords)).sum()
value_overlap_pct = round(value_facilities_overlap / len(value_df) * 100, 1) if len(value_df) > 0 else 0

# D. Top Negative Drivers (Global)
# Simplified Driver Extraction for robust execution
top_drivers = []
try:
    neg_rows = df[df['sentiment'].astype(str).str.lower().str.contains('negative')]
    if not neg_rows.empty:
        phrases = extract_key_phrases(neg_rows['verbatim'], n=8)
        for p in phrases:
            count = neg_rows['verbatim'].str.contains(p, case=False).sum()
            # Simple context extraction
            ctx_row = neg_rows[neg_rows['verbatim'].str.contains(p, case=False)].iloc[0]
            ctx = str(ctx_row['verbatim'])
            if len(ctx) > 100: ctx = ctx[:100] + "..."
            
            top_drivers.append({
                "phrase": p.title(),
                "context": ctx,
                "count": int(count)
            })
except Exception as e:
    print(f"Driver logic warning: {e}")

# --- 2. Standard Theme Data ---
themes = [
    "Infrastructure & Facilities", "Academic Quality & Curriculum", 
    "Parent–Teacher Communication", "Student Experience & Wellbeing", 
    "Teacher Quality & Stability", "School Leadership & Community", 
    "Resources & Capacity"
]

theme_stats = {}
for theme in themes:
    mask = df['standardized_theme'].astype(str).apply(lambda x: theme in x)
    subset = df[mask.fillna(False)]
    
    total = len(subset)
    if total == 0: 
        # Create empty placeholder to prevent JS errors if theme missing
        theme_stats[theme] = {
            "volume": 0, "school_count": 0, "sentiment_breakdown": {"positive":0,"neutral":0,"negative":0},
            "score": 0, "bucket": "Neutral", "neg_phrases": []
        }
        continue

    pos = len(subset[subset['sentiment'].astype(str).str.lower().str.contains('positive')])
    neu = len(subset[subset['sentiment'].astype(str).str.lower().str.contains('neutral')])
    neg = len(subset[subset['sentiment'].astype(str).str.lower().str.contains('negative')])
    
    neg_subset = subset[subset['sentiment'].astype(str).str.lower().str.contains('negative')]
    neg_phrases = extract_key_phrases(neg_subset['verbatim'])
    
    theme_score = calculate_sentiment_score(subset)
    school_coverage = subset['school_id'].nunique()
    
    theme_stats[theme] = {
        "volume": int(total),
        "school_count": int(school_coverage),
        "sentiment_breakdown": {"positive": pos, "neutral": neu, "negative": neg},
        "score": theme_score,
        "bucket": get_bucket(theme_score),
        "neg_phrases": neg_phrases
    }

# --- 3. Radial Graph Data ---
nodes = []
links = []
# Theme Nodes
for i, theme in enumerate(themes):
    nodes.append({"id": theme, "group": "theme"})

# School Nodes
school_metrics = []
for school, group in df.groupby('school_id'):
    school_metrics.append({
        "id": school,
        "score": calculate_sentiment_score(group),
        "count": len(group)
    })
school_metrics.sort(key=lambda x: x['score'], reverse=True)

for s in school_metrics:
    nodes.append({"id": s['id'], "group": "school", "score": s['score']})

# Links
pair_counts = {} 
for _, row in df.iterrows():
    s = row['school_id']
    t_str = str(row['standardized_theme'])
    sent_val = row['sentiment_score']
    # Themes might not be semicolon separated in Feedback.csv, just single theme usually.
    # But split just in case
    row_themes = [t.strip() for t in t_str.split(';')]
    for t in row_themes:
        if t in themes:
            key = (s, t)
            if key not in pair_counts: pair_counts[key] = {'count': 0, 'sent_sum': 0}
            pair_counts[key]['count'] += 1
            pair_counts[key]['sent_sum'] += sent_val

for (school, theme), stats in pair_counts.items():
    avg_sent = round(stats['sent_sum'] / stats['count'], 2)
    links.append({
        "source": school, "target": theme,
        "value": stats['count'], "sentiment": avg_sent
    })

# --- 4. Matrix Data Structure ---
matrix_data = []
for school_obj in school_metrics:
    school_name = school_obj['id']
    s_subset = df[df['school_id'] == school_name]
    
    # Extract City from the first row of this school
    city = "Global"
    if not s_subset.empty:
        city = s_subset.iloc[0]['city']
    
    school_row = {
        "name": school_name,
        "city": city,
        "count": len(s_subset),
        "themes": {}
    }
    school_theme_scores = []
    for theme in themes:
        mask = s_subset['standardized_theme'].astype(str).apply(lambda x: theme in x)
        t_sub = s_subset[mask]
        
        # Default empty
        item_data = None
        
        if not t_sub.empty:
            t_score = calculate_sentiment_score(t_sub)
            bucket = get_bucket(t_score)
            
            # --- OVERALL SCORE LOGIC: Collect score ---
            school_theme_scores.append(t_score)

            pos_c = len(t_sub[t_sub['sentiment'].astype(str).str.lower().str.contains('positive')])
            neu_c = len(t_sub[t_sub['sentiment'].astype(str).str.lower().str.contains('neutral')])
            neg_c = len(t_sub[t_sub['sentiment'].astype(str).str.lower().str.contains('negative')])
            
            # Verbatims logic
            t_sub = t_sub.copy()
            if t_score > 0:
                t_sub = t_sub.sort_values(['sentiment_score', 'verbatim'], ascending=[False, False])
            elif t_score < 0:
                t_sub = t_sub.sort_values(['sentiment_score', 'verbatim'], ascending=[True, False])
            else:
                t_sub['dist'] = abs(t_sub['sentiment_score'] - t_score)
                t_sub = t_sub.sort_values(['dist', 'verbatim'], ascending=[True, False])
            
            top_rows = t_sub.head(5)
            selected_verbatims = []
            for _, r in top_rows.iterrows():
                selected_verbatims.append({
                    "text": r['verbatim'],
                    "bucket": r['sentiment'],
                    "score": r['sentiment_score']
                })

            item_data = {
                "count": len(t_sub), 
                "avg_sentiment": t_score, 
                "sentiment_bucket": bucket,
                "sentiment_breakdown": {"pos": pos_c, "neu": neu_c, "neg": neg_c},
                "example_verbatims": json.dumps(selected_verbatims)
            }
        else:
            # --- OVERALL SCORE LOGIC: Missing theme counts as 0 ---
            school_theme_scores.append(0.0)
        
        school_row['themes'][theme] = item_data
        
    # --- OVERALL SCORE CALCULATION ---
    # 1. Average of the 7 themes
    overall_raw = sum(school_theme_scores) / len(themes)
    # 2. Normalize to %: (raw / 2) * 100
    overall_percent = (overall_raw / 2) * 100
    
    school_row['overall_raw'] = round(overall_raw, 2)
    school_row['overall_percent'] = round(overall_percent, 1) # One decimal for display
    
    matrix_data.append(school_row)

# --- 5. Generate Narrative Data Object ---
narrative = {
    "kpi": {
        "total": len(df),
        "score": calculate_sentiment_score(df),
        "neg_pct": round(len(df[df['sentiment'].astype(str).str.lower().str.contains('negative')]) / len(df) * 100, 1)
    },
    "insights": {
        "stability": {
            "neg_pct_of_topic": round(len(stability_neg)/len(stability_df)*100, 1) if len(stability_df) else 0,
            "turnover_mention_pct": turnover_pct
        },
        "communication": {
            "score": comm_score,
            "response_issue_count": int(response_issues)
        },
        "value": {
            "facilities_overlap_pct": value_overlap_pct
        },
        "drivers": top_drivers
    }
}

# --- Output ---
final_data = {
    "exec_summary": narrative, 
    "themes": theme_stats, 
    "radial_graph": { "nodes": nodes, "links": links },
    "matrix": matrix_data
}

# Save to dashboard/data/full_dashboard_data.json (relative to code/)
with open('../full_dashboard_data.json', 'w') as f:
    json.dump(final_data, f, indent=4)

print("Deep Dive Dashboard Data prepared from Feedback.csv.")
print(f"Total Schools Processed: {len(school_metrics)}")
print(f"Example School 1: {school_metrics[0]['id'] if school_metrics else 'None'}")
