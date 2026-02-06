import pandas as pd
df = pd.read_csv('../data/final_survey_feedback_complete.csv')
# Search for words like system, care, safe, contact, support
keywords = ['system', 'care', 'safe', 'contact', 'support']
subset = df[(df['standardized_theme'].str.contains('Wellbeing', case=False, na=False)) & 
            (df['sentiment'].str.contains('Negative', na=False)) &
            (df['verbatim'].str.contains('|'.join(keywords), case=False, na=False))]

if not subset.empty:
    for i, row in subset.head(3).iterrows():
        print(f"--- Result {i} ---")
        print(f"School: {row['school_id']}")
        print(f"Verbatim: {row['verbatim']}")
else:
    print("No matching verbatims found with keywords.")
