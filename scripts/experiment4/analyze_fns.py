import pandas as pd

df = pd.read_csv('scripts/experiment4/experiment4_detailed.csv')
fns = df[(df['predicted'] == False) & (df['is_conflict'] == True)]

print(f'False Negatives: {len(fns)}')
print(f'\nBreakdown by conflict type:')
print(fns['conflict_type'].value_counts())

print(f'\n\nTop 5 FNs by similarity (should have been caught):\n')

for i, row in fns.nlargest(5, 'cosine_sim').iterrows():
    print(f'Similarity: {row["cosine_sim"]:.3f}')
    print(f'Type: {row["conflict_type"]}')
    print(f'A: {row["req_i"][:150]}')
    print(f'B: {row["req_j"][:150]}')
    if pd.notna(row["notes"]):
        print(f'Notes: {row["notes"][:200]}')
    print('-' * 80)
