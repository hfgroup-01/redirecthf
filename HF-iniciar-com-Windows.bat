@echo off
rem Cria (ou remove) o atalho do HF na pasta Inicializar do Windows,
rem para o HF abrir sozinho quando voce fizer login.
cd /d "%~dp0"
set "ATALHO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\HF Redirects.lnk"
if exist "%ATALHO%" (
  del "%ATALHO%"
  echo Removido: o HF NAO vai mais abrir com o Windows.
) else (
  powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%ATALHO%'); $s.TargetPath=$env:ComSpec; $s.Arguments='/k \"%~dp0HF.bat\"'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Description='HF Redirects'; $s.Save()"
  echo Pronto: o HF vai abrir (minimizado) toda vez que voce entrar no Windows.
  echo Rode este arquivo de novo para desfazer.
)
pause
