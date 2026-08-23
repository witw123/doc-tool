"""
Generate realistic mock directories and files for testing and demo.
"""
import os
import shutil


def create_mock_environment(base_path: str = "mock_data"):
    """
    Creates two mock directories (dir_a and dir_b) with:
    - Multiple prefixes (IMG_, DOC_, DATA_, LOG_, REPORT_)
    - Nested folder structures (depth 1 to 4)
    - Leaf directories with varying file counts
    - Identical files, missing files, size difference files, moved files
    """
    abs_base = os.path.abspath(base_path)
    if os.path.exists(abs_base):
        shutil.rmtree(abs_base)

    dir_a = os.path.join(abs_base, "folder_a")
    dir_b = os.path.join(abs_base, "folder_b")

    os.makedirs(dir_a, exist_ok=True)
    os.makedirs(dir_b, exist_ok=True)

    # 1. Folder A structure
    # Leaf folder 1: docs/2024/q1
    f1_a = os.path.join(dir_a, "docs", "2024", "q1")
    os.makedirs(f1_a, exist_ok=True)
    for i in range(1, 11):
        with open(os.path.join(f1_a, f"DOC_2024_Q1_report_{i:02d}.docx"), "w", encoding="utf-8") as f:
            f.write(f"Sample report Q1 content {i} " * 20)

    # Leaf folder 2: docs/2024/q2
    f2_a = os.path.join(dir_a, "docs", "2024", "q2")
    os.makedirs(f2_a, exist_ok=True)
    for i in range(1, 6):
        with open(os.path.join(f2_a, f"DOC_2024_Q2_report_{i:02d}.docx"), "w", encoding="utf-8") as f:
            f.write(f"Sample report Q2 content {i} " * 20)

    # Leaf folder 3: media/photos/raw
    f3_a = os.path.join(dir_a, "media", "photos", "raw")
    os.makedirs(f3_a, exist_ok=True)
    for i in range(1, 16):
        with open(os.path.join(f3_a, f"IMG_RAW_{i:04d}.jpg"), "wb") as f:
            f.write(b"JPEG_HEADER_MOCK_DATA" * (i * 10))

    # Leaf folder 4: media/videos
    f4_a = os.path.join(dir_a, "media", "videos")
    os.makedirs(f4_a, exist_ok=True)
    for i in range(1, 4):
        with open(os.path.join(f4_a, f"VID_2024_{i:02d}.mp4"), "wb") as f:
            f.write(b"MP4_DATA" * 500)

    # Leaf folder 5: logs/archive (Only in A)
    f5_a = os.path.join(dir_a, "logs", "archive")
    os.makedirs(f5_a, exist_ok=True)
    for i in range(1, 8):
        with open(os.path.join(f5_a, f"LOG_system_a_{i:02d}.log"), "w", encoding="utf-8") as f:
            f.write("Log trace info...")

    # Root files in A
    with open(os.path.join(dir_a, "README.md"), "w", encoding="utf-8") as f:
        f.write("# Folder A Documentation")
    with open(os.path.join(dir_a, "DATA_summary.csv"), "w", encoding="utf-8") as f:
        f.write("id,name,value\n1,alpha,100")

    # 2. Folder B structure (Similar with intentional differences)
    # Identical: docs/2024/q1 (Same 10 files)
    f1_b = os.path.join(dir_b, "docs", "2024", "q1")
    os.makedirs(f1_b, exist_ok=True)
    for i in range(1, 11):
        with open(os.path.join(f1_b, f"DOC_2024_Q1_report_{i:02d}.docx"), "w", encoding="utf-8") as f:
            f.write(f"Sample report Q1 content {i} " * 20)

    # Different attribute / size: docs/2024/q2 (Files 1-5 exist, but file 01 is modified in B)
    f2_b = os.path.join(dir_b, "docs", "2024", "q2")
    os.makedirs(f2_b, exist_ok=True)
    for i in range(1, 6):
        with open(os.path.join(f2_b, f"DOC_2024_Q2_report_{i:02d}.docx"), "w", encoding="utf-8") as f:
            extra = "MODIFIED IN B WITH EXTRA DATA" if i == 1 else ""
            f.write((f"Sample report Q2 content {i} " * 20) + extra)

    # Missing in A / Only in B: docs/2024/q3
    f3_b = os.path.join(dir_b, "docs", "2024", "q3")
    os.makedirs(f3_b, exist_ok=True)
    for i in range(1, 9):
        with open(os.path.join(f3_b, f"DOC_2024_Q3_report_{i:02d}.docx"), "w", encoding="utf-8") as f:
            f.write(f"Sample report Q3 content {i} in B only " * 15)

    # Moved file: media/photos/raw -> in B it's in media/photos/backup
    f_b_backup = os.path.join(dir_b, "media", "photos", "backup")
    os.makedirs(f_b_backup, exist_ok=True)
    for i in range(1, 6):
        with open(os.path.join(f_b_backup, f"IMG_RAW_{i:04d}.jpg"), "wb") as f:
            f.write(b"JPEG_HEADER_MOCK_DATA" * (i * 10))

    # Root files in B
    with open(os.path.join(dir_b, "README.md"), "w", encoding="utf-8") as f:
        f.write("# Folder A Documentation")  # Exact match
    with open(os.path.join(dir_b, "DATA_summary.csv"), "w", encoding="utf-8") as f:
        f.write("id,name,value\n1,alpha,100\n2,beta,200\n3,gamma,300")  # Size difference

    print(f"Mock test directories created successfully:")
    print(f"Folder A: {dir_a}")
    print(f"Folder B: {dir_b}")
    return dir_a, dir_b


if __name__ == "__main__":
    create_mock_environment()
