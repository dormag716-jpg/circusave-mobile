import sys

file_path = "app/circle/workspace.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Import Image
if "Image," not in content and "Image " not in content:
    content = content.replace("  View,\n  Share,\n} from 'react-native';", "  View,\n  Share,\n  Image,\n} from 'react-native';")

# 2. Fix renderBadgeTone
content = content.replace("renderBadgeTone", "statusTone")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed imports and functions.")
