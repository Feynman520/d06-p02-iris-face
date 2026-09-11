# IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
# -*- coding: utf-8 -*-
"""
doc2pdf.py — 문서(한/글·워드·엑셀·파워포인트)를 PDF로 변환한다.

IRIS-Face 데몬이 부르는 독립 실행 스크립트. 대화 안에 문서를 삽입하려고 원본을 PDF로
한 번 바꿔 캐시에 둔다. 원본은 절대 건드리지 않는다(읽기 전용으로 열고 새 PDF만 만든다).

사용:  python doc2pdf.py <원본경로> <PDF저장경로>
성공:  종료코드 0 + stdout 마지막 줄 "OK <PDF경로>"
실패:  종료코드 1 + stderr 에 사유

인터프리터:
  - .hwp/.hwpx → pyhwpx 가 깔린 한/글 MCP venv 파이썬으로 실행해야 한다(데몬이 골라 준다).
  - .doc(x)/.xls(x)/.ppt(x) → win32com 이 있는 아무 파이썬(시스템 파이썬 가능).
"""
from __future__ import annotations

import os
import sys

# 윈도 cp949 콘솔에서 한글 print 가 죽지 않도록 (R-010)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def _err(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _ensure_parent(path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)


# ---------------------------------------------------------------- 한/글 --------
def _ensure_hwp_security() -> None:
    """한/글 보안승인모듈(FilePathChecker)을 HKCU 레지스트리에 선등록한다.

    없으면 한/글이 파일 입출력 때 팝업을 띄워 무인 변환이 멈춘다. pyhwpx 번들 DLL 을
    찾아 레지스트리 값만 써 둔다(이미 있으면 그대로). MCP 세션 코드와 같은 방식."""
    try:
        import winreg

        import pyhwpx

        dll = os.path.join(os.path.dirname(os.path.abspath(pyhwpx.__file__)),
                           "FilePathCheckerModule.dll")
        if not os.path.exists(dll):
            return
        for sub in (r"Software\HNC\HwpAutomation\Modules",
                    r"Software\Hnc\HwpUserAction\Modules"):
            try:
                key = winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, sub, 0, winreg.KEY_WRITE)
                winreg.SetValueEx(key, "FilePathCheckerModule", 0, winreg.REG_SZ, dll)
                winreg.CloseKey(key)
            except OSError:
                continue
    except Exception as e:  # 등록 실패해도 변환은 시도한다
        _err(f"[hwp] 보안모듈 등록 건너뜀: {e!r}")


def hwp_to_pdf(src: str, out: str) -> None:
    _ensure_hwp_security()
    from pyhwpx import Hwp

    hwp = Hwp(new=True, visible=False)
    try:
        if not hwp.open(src):
            raise RuntimeError(f"한/글 열기 실패: {src}")
        ok = hwp.save_as(out)  # 확장자 .pdf → 내부 PDF 액션
        if not ok or not os.path.exists(out):
            raise RuntimeError(f"PDF 저장 실패(반환={ok})")
    finally:
        try:
            hwp.clear()
        except Exception:
            pass
        try:
            hwp.quit()
        except Exception:
            pass


# --------------------------------------------------------------- 오피스 --------
def _office_to_pdf(src: str, out: str, ext: str) -> None:
    import pythoncom
    import win32com.client as win32

    pythoncom.CoInitialize()
    try:
        if ext in (".doc", ".docx", ".rtf", ".odt"):
            app = win32.DispatchEx("Word.Application")
            app.Visible = False
            try:
                doc = app.Documents.Open(src, ReadOnly=True)
                doc.ExportAsFixedFormat(OutputFileName=out, ExportFormat=17)  # wdExportFormatPDF
                doc.Close(False)
            finally:
                app.Quit()
        elif ext in (".xls", ".xlsx", ".xlsm", ".ods"):
            app = win32.DispatchEx("Excel.Application")
            app.Visible = False
            app.DisplayAlerts = False
            try:
                wb = app.Workbooks.Open(src, ReadOnly=True)
                wb.ExportAsFixedFormat(0, out)  # 0 = xlTypePDF, 시트 전체
                wb.Close(False)
            finally:
                app.Quit()
        elif ext in (".ppt", ".pptx", ".odp"):
            app = win32.DispatchEx("PowerPoint.Application")
            try:
                pres = app.Presentations.Open(src, ReadOnly=True, WithWindow=False)
                pres.SaveAs(out, 32)  # 32 = ppSaveAsPDF
                pres.Close()
            finally:
                app.Quit()
        else:
            raise RuntimeError(f"지원하지 않는 오피스 형식: {ext}")
    finally:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass
    if not os.path.exists(out):
        raise RuntimeError("PDF가 생성되지 않았습니다.")


# ----------------------------------------------------------------- main --------
def main() -> int:
    if len(sys.argv) != 3:
        _err("사용법: python doc2pdf.py <원본> <PDF저장경로>")
        return 2
    src, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    if not os.path.exists(src):
        _err(f"원본을 찾을 수 없습니다: {src}")
        return 1
    _ensure_parent(out)
    ext = os.path.splitext(src)[1].lower()
    try:
        if ext in (".hwp", ".hwpx"):
            hwp_to_pdf(src, out)
        else:
            _office_to_pdf(src, out, ext)
    except Exception as e:
        _err(f"변환 실패({ext}): {e!r}")
        return 1
    print(f"OK {out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
