#pragma once
#include <windows.h>
#include <d2d1.h>
#include <dwrite.h>
#include <string>
#include <vector>
#include "IpcMessenger.h"

#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "dwrite.lib")

class Renderer {
public:
    Renderer();
    ~Renderer();

    bool Initialize(HWND hWnd);
    void Render(const ProjectState& state, bool haloMode, const std::vector<LinkEntry>& links, int hoveredBubble);
    void Resize(UINT width, UINT height);

private:
    void DiscardResources();

    HWND m_hWnd;
    ID2D1Factory* m_pD2DFactory;
    ID2D1HwndRenderTarget* m_pRenderTarget;
    IDWriteFactory* m_pDWriteFactory;
    IDWriteTextFormat* m_pTextFormatBold;
    IDWriteTextFormat* m_pTextFormatNormal;
    IDWriteTextFormat* m_pTextFormatSmall;

    ID2D1SolidColorBrush* m_pBgBrush;
    ID2D1SolidColorBrush* m_pBorderBrush;
    ID2D1SolidColorBrush* m_pDotBrush;
    ID2D1SolidColorBrush* m_pTextBrush;
    ID2D1SolidColorBrush* m_pHaloBubbleBrush;
    ID2D1SolidColorBrush* m_pHaloAssignedBrush;
    ID2D1SolidColorBrush* m_pHaloHoverBrush;
    ID2D1SolidColorBrush* m_pHaloAssignedBorderBrush;
    ID2D1SolidColorBrush* m_pHaloEmptyBrush;
    ID2D1SolidColorBrush* m_pHaloEmptyBorderBrush;
    ID2D1SolidColorBrush* m_pHaloEmptyTextBrush;
};
