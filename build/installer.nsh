; IV Studio's installer in its own colours (electron-builder includes this file by name).
; The welcome and finish pages and the strip along the top of every page use the app's near-black and cream;
; the middle of each page is drawn by Windows and keeps its own colours. The artwork (installerSidebar.bmp,
; uninstallerSidebar.bmp, installerHeader.bmp) is made by build/installer-art.py from the app's eye art.

!define MUI_BGCOLOR "100C0E"
!define MUI_TEXTCOLOR "F4ECDC"

; A welcome page before the install choices, with the eye down the side.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to IV Studio"
  !define MUI_WELCOMEPAGE_TEXT "Make films with MiniMax H3 on your own computer or your own cloud: hunt a few takes, pick the one you like and finish it at full size.$\r$\n$\r$\nYour projects, renders and settings are kept when you update.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend
