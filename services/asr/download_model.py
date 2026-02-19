"""
模型下载脚本，输出 JSON 格式的进度信息到 stdout
用法: python -m download_model <model_id> <local_dir>
"""
import json
import sys
from modelscope import snapshot_download
from modelscope.hub.callback import ProgressCallback


class JsonProgressCallback(ProgressCallback):
    """自定义进度回调，输出 JSON 到 stdout"""

    def __init__(self, filename: str, file_size: int):
        super().__init__(filename, file_size)
        self.downloaded = 0

    def update(self, size: int):
        self.downloaded += size
        progress = {
            "type": "progress",
            "filename": self.filename,
            "downloaded": self.downloaded,
            "total": self.file_size,
            "percent": round(self.downloaded / self.file_size * 100, 1)
            if self.file_size > 0
            else 0,
        }
        # 输出到 stdout，主进程捕获
        print(json.dumps(progress), flush=True)

    def end(self):
        print(
            json.dumps({"type": "file_complete", "filename": self.filename}),
            flush=True,
        )


def download(model_id: str, local_dir: str):
    """执行模型下载"""
    print(
        json.dumps(
            {"type": "start", "model_id": model_id, "local_dir": local_dir}
        ),
        flush=True,
    )

    try:
        snapshot_download(
            model_id=model_id,
            local_dir=local_dir,
            progress_callbacks=[JsonProgressCallback],
        )
        print(json.dumps({"type": "complete"}), flush=True)
    except Exception as e:
        print(json.dumps({"type": "error", "message": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            json.dumps(
                {
                    "type": "error",
                    "message": "Usage: download_model.py <model_id> <local_dir>",
                }
            ),
            flush=True,
        )
        sys.exit(1)

    download(sys.argv[1], sys.argv[2])
