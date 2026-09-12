' IRIS-Face - (c) 2026 Sejun Ham - MIT - https://feynman520.github.io/card/#home
' Runs launch.mjs with NO console window (v2.49, 2026-09-12).
' IRIS-Face.cmd calls this file through wscript.exe so that the only thing you see is the Face window.
' Everything the launcher prints goes to state\launch.log; a fatal failure shows a message box (launch.mjs).
' Arguments are passed through unchanged (--browser, --no-open, --port N, --first-session <spec>).
' node.exe: IRIS_FACE_NODE (bundled installs) > "node" on PATH.
' ASCII only on purpose: wscript reads .vbs as ANSI, so no Korean/Unicode in this file.
Option Explicit
Dim sh, fso, here, args, i, a, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
args = ""
For i = 0 To WScript.Arguments.Count - 1
  a = WScript.Arguments(i)
  If InStr(a, " ") > 0 Then a = """" & a & """"
  args = args & " " & a
Next
cmd = """" & NodeExe() & """ """ & here & "\launch.mjs""" & args
On Error Resume Next
sh.Run cmd, 0, False
If Err.Number <> 0 Then
  MsgBox "IRIS-Face could not start node.exe." & vbCrLf & Err.Description & vbCrLf & vbCrLf & cmd, vbCritical, "IRIS-Face"
End If

Function NodeExe()
  Dim v
  v = sh.ExpandEnvironmentStrings("%IRIS_FACE_NODE%")
  If v <> "%IRIS_FACE_NODE%" And v <> "" Then
    NodeExe = v
  Else
    NodeExe = "node"
  End If
End Function
