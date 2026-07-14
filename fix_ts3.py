import sys

file_path = "app/circle/workspace.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("contribution: any }", "contribution?: any }")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed TS error.")
