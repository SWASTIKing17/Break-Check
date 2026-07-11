#include <windows.h>
#include <windowsx.h>
#include <ole2.h>
#include <string>
#include <vector>
#include <cmath>
#include "Renderer.h"
#include "DropHandler.h"
#include "IpcMessenger.h"
#include <dwmapi.h>
#pragma comment(lib, "dwmapi.lib")

static Renderer g_renderer;
static IpcMessenger g_messenger;
static DropHandler* g_pDropHandler = NULL;

static ProjectState g_state;

static UINT g_curWidth = 84;
static UINT g_curHeight = 84;
static bool g_isHovered = false;

static bool g_haloMode = false;
static std::vector<std::wstring> g_haloFiles;
static bool g_haloMoveMode = false;
static std::vector<LinkEntry> g_linkMap;
static int g_hoveredBubble = 0;
static int g_posX = 20;
static int g_posY = 115;

void ExitHaloMode(HWND hWnd) {
    if (!g_haloMode) return;
    g_haloMode = false;
    g_haloFiles.clear();
    g_curWidth = 84;
    g_curHeight = 84;
    SetWindowPos(hWnd, HWND_TOPMOST, g_posX, g_posY, 84, 84, SWP_SHOWWINDOW);
    g_renderer.Resize(84, 84);
    InvalidateRect(hWnd, NULL, FALSE);
}

LRESULT CALLBACK WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_CREATE:
    {
        g_renderer.Initialize(hWnd);
        g_pDropHandler = new DropHandler(hWnd);
        RegisterDragDrop(hWnd, g_pDropHandler);
        return 0;
    }
    case WM_APP_DROP_FILES:
    {
        DropPayload* payload = reinterpret_cast<DropPayload*>(wParam);
        if (payload) {
            if (payload->ctrlPressed) {
                g_haloMode = true;
                g_haloFiles = payload->files;
                g_haloMoveMode = payload->shiftPressed;
                g_hoveredBubble = 0;
                g_curWidth = 220;
                g_curHeight = 220;
                SetWindowPos(hWnd, HWND_TOPMOST, g_posX - 68, g_posY - 68, 220, 220, SWP_SHOWWINDOW);
                g_renderer.Resize(220, 220);

                DWORD foreThread = GetWindowThreadProcessId(GetForegroundWindow(), NULL);
                DWORD curThread = GetCurrentThreadId();
                if (foreThread != curThread && foreThread != 0) {
                    AttachThreadInput(foreThread, curThread, TRUE);
                    SetForegroundWindow(hWnd);
                    SetFocus(hWnd);
                    AttachThreadInput(foreThread, curThread, FALSE);
                } else {
                    SetForegroundWindow(hWnd);
                    SetFocus(hWnd);
                }

                InvalidateRect(hWnd, NULL, FALSE);
            } else {
                g_messenger.SendDropImport(payload->files, payload->shiftPressed, false, L"");
            }
            delete payload;
        }
        return 0;
    }
    case WM_APP_UPDATE_STATE:
    {
        InvalidateRect(hWnd, NULL, FALSE);
        UpdateWindow(hWnd);
        return 0;
    }
    case WM_ACTIVATE:
    {
        if (LOWORD(wParam) == WA_INACTIVE && g_haloMode) {
            ExitHaloMode(hWnd);
        }
        break;
    }
    case WM_KEYDOWN:
    {
        if (g_haloMode) {
            if (wParam == VK_ESCAPE) {
                ExitHaloMode(hWnd);
                return 0;
            }
            int num = 0;
            if (wParam >= '1' && wParam <= '8') num = wParam - '0';
            else if (wParam >= VK_NUMPAD1 && wParam <= VK_NUMPAD8) num = wParam - VK_NUMPAD0;

            if (num >= 1 && num <= 8) {
                std::wstring targetFolder = L"";
                std::wstring targetBin = L"";
                for (const auto& l : g_linkMap) {
                    if (l.shortcut == std::to_wstring(num)) {
                        targetFolder = l.folderPath;
                        targetBin = l.binName;
                        break;
                    }
                }
                g_messenger.SendDropImport(g_haloFiles, g_haloMoveMode, false, targetFolder, targetBin);
                ExitHaloMode(hWnd);
                return 0;
            }
        }
        break;
    }
    case WM_NCHITTEST:
    {
        POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
        ScreenToClient(hWnd, &pt);
        if (g_haloMode) {
            float dx = (float)pt.x - 110.0f;
            float dy = (float)pt.y - 110.0f;
            if (dx * dx + dy * dy > 110.0f * 110.0f) return HTNOWHERE;
            return HTCLIENT;
        }
        if (pt.x < 0 || pt.y < 0 || pt.x > (LONG)g_curWidth || pt.y > (LONG)g_curHeight) {
            return HTNOWHERE;
        }
        return HTCLIENT;
    }
    case WM_LBUTTONDOWN:
    {
        if (g_haloMode) {
            if (g_hoveredBubble > 0) {
                std::wstring targetFolder = L"";
                std::wstring targetBin = L"";
                for (const auto& l : g_linkMap) {
                    if (l.shortcut == std::to_wstring(g_hoveredBubble)) {
                        targetFolder = l.folderPath;
                        targetBin = l.binName;
                        break;
                    }
                }
                g_messenger.SendDropImport(g_haloFiles, g_haloMoveMode, false, targetFolder, targetBin);
            }
            ExitHaloMode(hWnd);
            return 0;
        }
        ReleaseCapture();
        SendMessage(hWnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        return 0;
    }
    case WM_MBUTTONDOWN:
    {
        return 0;
    }
    case WM_MBUTTONUP:
    {
        static DWORD lastMButtonClickTime = 0;
        DWORD now = GetTickCount();
        if (now - lastMButtonClickTime > 350) {
            lastMButtonClickTime = now;
            g_messenger.SendLog("info", "pill:cycle-profile", "{}");
            g_messenger.SendCycleProfile();
        }
        return 0;
    }
    case WM_MOUSEMOVE:
    {
        if (g_haloMode) {
            POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
            const float PI = 3.14159265358979323846f;
            int newHover = 0;
            for (int n = 1; n <= 8; n++) {
                float angle = (n - 1) * PI / 4.0f;
                float bx = 110.0f + std::sin(angle) * 58.0f;
                float by = 110.0f - std::cos(angle) * 58.0f;
                float dx = (float)pt.x - bx;
                float dy = (float)pt.y - by;
                if (dx * dx + dy * dy <= 16.0f * 16.0f) {
                    newHover = n;
                    break;
                }
            }
            if (newHover != g_hoveredBubble) {
                g_hoveredBubble = newHover;
                InvalidateRect(hWnd, NULL, FALSE);
            }
            return 0;
        }
        if (!g_isHovered) {
            g_isHovered = true;
            TRACKMOUSEEVENT tme = { sizeof(TRACKMOUSEEVENT), TME_LEAVE, hWnd, 0 };
            TrackMouseEvent(&tme);

            if (!g_state.projectName.empty() && g_state.projectName != L"No Project") {
                g_curWidth = 350;
                SetWindowPos(hWnd, NULL, 0, 0, g_curWidth, g_curHeight, SWP_NOMOVE | SWP_NOZORDER);
                g_renderer.Resize(g_curWidth, g_curHeight);
                InvalidateRect(hWnd, NULL, FALSE);
            }
        }
        return 0;
    }
    case WM_MOUSELEAVE:
    {
        if (!g_haloMode) {
            g_isHovered = false;
            if (g_curWidth != 84) {
                g_curWidth = 84;
                SetWindowPos(hWnd, NULL, 0, 0, g_curWidth, g_curHeight, SWP_NOMOVE | SWP_NOZORDER);
                g_renderer.Resize(g_curWidth, g_curHeight);
                InvalidateRect(hWnd, NULL, FALSE);
            }
        }
        return 0;
    }
    case WM_PAINT:
    {
        PAINTSTRUCT ps;
        BeginPaint(hWnd, &ps);
        g_renderer.Render(g_state, g_haloMode, g_linkMap, g_hoveredBubble);
        EndPaint(hWnd, &ps);
        return 0;
    }
    case WM_MOVE:
    {
        if (!g_haloMode) {
            RECT rc;
            GetWindowRect(hWnd, &rc);
            g_posX = rc.left;
            g_posY = rc.top;
        }
        return 0;
    }
    case WM_DESTROY:
    {
        RevokeDragDrop(hWnd);
        if (g_pDropHandler) {
            g_pDropHandler->Release();
            g_pDropHandler = NULL;
        }
        PostQuitMessage(0);
        return 0;
    }
    }
    return DefWindowProc(hWnd, msg, wParam, lParam);
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    OleInitialize(NULL);

    WNDCLASSEXW wc = { sizeof(WNDCLASSEXW), CS_HREDRAW | CS_VREDRAW, WndProc, 0, 0, hInstance, NULL, LoadCursor(NULL, IDC_ARROW), NULL, NULL, L"FreeXanNativePillClass", NULL };
    RegisterClassExW(&wc);

    HWND hWnd = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED,
        L"FreeXanNativePillClass",
        L"FreeXan C++ Pill",
        WS_POPUP | WS_VISIBLE,
        g_posX, g_posY, g_curWidth, g_curHeight,
        NULL, NULL, hInstance, NULL
    );

    MARGINS margins = { -1, -1, -1, -1 };
    DwmExtendFrameIntoClientArea(hWnd, &margins);
    SetLayeredWindowAttributes(hWnd, 0, 255, LWA_ALPHA);

    g_messenger.SetStateCallback([hWnd](const ProjectState& state) {
        g_state = state;
        if (g_state.projectName.empty() && !g_state.nativeProjectName.empty()) {
            g_state.projectName = g_state.nativeProjectName;
        } else if (g_state.projectName.empty()) {
            g_state.projectName = L"No Project";
        }
        PostMessage(hWnd, WM_APP_UPDATE_STATE, 0, 0);
    });

    g_messenger.SetLinkMapCallback([hWnd](const std::vector<LinkEntry>& links) {
        g_linkMap = links;
        if (g_haloMode) PostMessage(hWnd, WM_APP_UPDATE_STATE, 0, 0);
    });

    g_messenger.SetCommandCallback([hWnd](const std::string& cmd) {
        if (cmd == "reposition") {
            g_posX = 20;
            g_posY = 115;
            SetWindowPos(hWnd, NULL, g_posX, g_posY, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
            InvalidateRect(hWnd, NULL, FALSE);
        } else if (cmd == "quit") {
            PostMessage(hWnd, WM_CLOSE, 0, 0);
        }
    });

    g_messenger.Start(L"\\\\.\\pipe\\freexan_pill");

    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    g_messenger.Stop();
    OleUninitialize();
    return (int)msg.wParam;
}
