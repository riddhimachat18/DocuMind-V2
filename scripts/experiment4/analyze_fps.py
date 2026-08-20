import pandas as pd

df = pd.read_csv('scripts/experiment4/experiment4_detailed.csv')
fps = df[(df['predicted'] == True) & (df['is_conflict'] == False)]

print(f'False Positives: {len(fps)}')
print(f'\nTop 5 FPs by similarity:\n')

for i, row in fps.nlargest(5, 'cosine_sim').iterrows():
    print(f'Similarity: {row["cosine_sim"]:.3f}')
    print(f'Type marked: {row["conflict_type"]}')
    print(f'A: {row["req_i"][:150]}')
    print(f'B: {row["req_j"][:150]}')
    print(f'Notes: {row["notes"]}')
    print('-' * 80)
