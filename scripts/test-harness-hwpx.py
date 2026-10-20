"""Open generated synthetic files in isolated Hancom sessions and save copies."""
import json
import sys
from pathlib import Path
import win32com.client

root = Path(sys.argv[1] if len(sys.argv) > 1 else "_workspace/harness-quality-1.5.1").resolve()
reports = []
for name in ["공문_교정결과", "native-corrected", "table-corrected"]:
    source = root / (name + ".hwpx")
    target = root / (name + "-resaved.hwpx")
    original = source.read_bytes()
    hwp = win32com.client.DispatchEx("HWPFrame.HwpObject")
    try:
        hwp.XHwpWindows.Item(0).Visible = False
        # Fail before Open if registration is missing, avoiding another warning.
        assert hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
        assert hwp.Open(str(source), "HWPX", "forceopen:true")
        pages = hwp.PageCount
        assert hwp.SaveAs(str(target), "HWPX", "")
        assert source.read_bytes() == original
        result = {"file": name, "registered": True, "opened": True,
                  "saved": True, "pages": pages, "sourcePreserved": True}
        reports.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    finally:
        hwp.Quit()
(root / "hancom-open-save.json").write_text(
    json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
