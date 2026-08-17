Set WshShell = CreateObject("WScript.Shell")
Do While Not WScript.StdIn.AtEndOfStream
    line = WScript.StdIn.ReadLine()
    If line = "__EXIT__" Then Exit Do
    If Len(line) > 0 Then
        On Error Resume Next
        WshShell.SendKeys line
        On Error Goto 0
    End If
Loop