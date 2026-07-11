#include "Renderer.h"
#include <cmath>

template<class T> void SafeRelease(T** ppT) {
    if (*ppT) {
        (*ppT)->Release();
        *ppT = NULL;
    }
}

Renderer::Renderer() : m_hWnd(NULL), m_pD2DFactory(NULL), m_pRenderTarget(NULL),
    m_pDWriteFactory(NULL), m_pTextFormatBold(NULL), m_pTextFormatNormal(NULL), m_pTextFormatSmall(NULL),
    m_pBgBrush(NULL), m_pBorderBrush(NULL), m_pDotBrush(NULL), m_pTextBrush(NULL),
    m_pHaloBubbleBrush(NULL), m_pHaloAssignedBrush(NULL), m_pHaloHoverBrush(NULL),
    m_pHaloAssignedBorderBrush(NULL), m_pHaloEmptyBrush(NULL), m_pHaloEmptyBorderBrush(NULL), m_pHaloEmptyTextBrush(NULL) {}

Renderer::~Renderer() {
    DiscardResources();
    SafeRelease(&m_pTextFormatBold);
    SafeRelease(&m_pTextFormatNormal);
    SafeRelease(&m_pTextFormatSmall);
    SafeRelease(&m_pDWriteFactory);
    SafeRelease(&m_pD2DFactory);
}

bool Renderer::Initialize(HWND hWnd) {
    m_hWnd = hWnd;
    HRESULT hr = D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &m_pD2DFactory);
    if (FAILED(hr)) return false;

    hr = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), reinterpret_cast<IUnknown**>(&m_pDWriteFactory));
    if (FAILED(hr)) return false;

    hr = m_pDWriteFactory->CreateTextFormat(
        L"Segoe UI", NULL, DWRITE_FONT_WEIGHT_BOLD, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL,
        14.0f, L"en-US", &m_pTextFormatBold
    );
    if (FAILED(hr)) return false;
    m_pTextFormatBold->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
    m_pTextFormatBold->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);

    hr = m_pDWriteFactory->CreateTextFormat(
        L"Segoe UI", NULL, DWRITE_FONT_WEIGHT_NORMAL, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL,
        12.0f, L"en-US", &m_pTextFormatNormal
    );
    if (FAILED(hr)) return false;
    m_pTextFormatNormal->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
    m_pTextFormatNormal->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);

    hr = m_pDWriteFactory->CreateTextFormat(
        L"Segoe UI", NULL, DWRITE_FONT_WEIGHT_SEMI_BOLD, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL,
        10.5f, L"en-US", &m_pTextFormatSmall
    );
    if (SUCCEEDED(hr)) {
        m_pTextFormatSmall->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
        m_pTextFormatSmall->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
    }

    return true;
}

void Renderer::DiscardResources() {
    SafeRelease(&m_pBgBrush);
    SafeRelease(&m_pBorderBrush);
    SafeRelease(&m_pDotBrush);
    SafeRelease(&m_pTextBrush);
    SafeRelease(&m_pHaloBubbleBrush);
    SafeRelease(&m_pHaloAssignedBrush);
    SafeRelease(&m_pHaloHoverBrush);
    SafeRelease(&m_pHaloAssignedBorderBrush);
    SafeRelease(&m_pHaloEmptyBrush);
    SafeRelease(&m_pHaloEmptyBorderBrush);
    SafeRelease(&m_pHaloEmptyTextBrush);
    SafeRelease(&m_pRenderTarget);
}

void Renderer::Resize(UINT width, UINT height) {
    if (m_pRenderTarget) {
        D2D1_SIZE_U size = D2D1::SizeU(width, height);
        m_pRenderTarget->Resize(size);
    }
}

void Renderer::Render(const ProjectState& state, bool haloMode, const std::vector<LinkEntry>& links, int hoveredBubble) {
    if (!m_pRenderTarget) {
        RECT rc;
        GetClientRect(m_hWnd, &rc);
        D2D1_SIZE_U size = D2D1::SizeU(rc.right - rc.left, rc.bottom - rc.top);
        HRESULT hr = m_pD2DFactory->CreateHwndRenderTarget(
            D2D1::RenderTargetProperties(D2D1_RENDER_TARGET_TYPE_DEFAULT, D2D1::PixelFormat(DXGI_FORMAT_UNKNOWN, D2D1_ALPHA_MODE_PREMULTIPLIED)),
            D2D1::HwndRenderTargetProperties(m_hWnd, size),
            &m_pRenderTarget
        );
        if (FAILED(hr)) return;

        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(0x18181a, 0.95f), &m_pBgBrush);
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(state.connected ? 0x22c55e : 0xef4444, 1.0f), &m_pBorderBrush);
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(0xffffff, 1.0f), &m_pTextBrush);
        
        float r = state.profileColorR / 255.0f;
        float g = state.profileColorG / 255.0f;
        float b = state.profileColorB / 255.0f;
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(r, g, b, 1.0f), &m_pDotBrush);
        
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(0x242426, 0.85f), &m_pHaloBubbleBrush);
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(0x7c3aed, 0.85f), &m_pHaloAssignedBrush);
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(0x8b5cf6, 1.0f), &m_pHaloHoverBrush);
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(0xb09eff, 1.0f), &m_pHaloAssignedBorderBrush);
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(0x18181a, 0.45f), &m_pHaloEmptyBrush);
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(0xffffff, 0.18f), &m_pHaloEmptyBorderBrush);
        m_pRenderTarget->CreateSolidColorBrush(D2D1::ColorF(1.0f, 1.0f, 1.0f, 0.28f), &m_pHaloEmptyTextBrush);
    } else {
        if (m_pBorderBrush) {
            m_pBorderBrush->SetColor(D2D1::ColorF(state.connected ? 0x22c55e : 0xef4444, 1.0f));
        }
        if (m_pDotBrush) {
            float r = state.profileColorR / 255.0f;
            float g = state.profileColorG / 255.0f;
            float b = state.profileColorB / 255.0f;
            m_pDotBrush->SetColor(D2D1::ColorF(r, g, b, 1.0f));
        }
    }

    m_pRenderTarget->BeginDraw();
    m_pRenderTarget->Clear(D2D1::ColorF(0.0f, 0.0f, 0.0f, 0.0f));

    D2D1_SIZE_F size = m_pRenderTarget->GetSize();
    float center_x = haloMode ? size.width / 2.0f : size.height / 2.0f;
    float center_y = size.height / 2.0f;
    float pillW = haloMode ? 82.0f : size.width - 2.0f;
    float pillH = haloMode ? 82.0f : size.height - 2.0f;
    float rx = haloMode ? (center_x - pillW / 2.0f) : 1.0f;
    float ry = haloMode ? (center_y - pillH / 2.0f) : 1.0f;

    D2D1_ROUNDED_RECT pillRect = D2D1::RoundedRect(
        D2D1::RectF(rx, ry, rx + pillW, ry + pillH),
        pillH / 2.0f, pillH / 2.0f
    );

    m_pRenderTarget->FillRoundedRectangle(pillRect, m_pBgBrush);
    m_pRenderTarget->DrawRoundedRectangle(pillRect, m_pBorderBrush, 2.5f); // Thicker border for connection status

    float dotX = haloMode ? center_x : (size.height / 2.0f); // Moved dot closer to the left edge
    float dotY = center_y;
    float dotRadius = 18.0f; // Slightly larger for initials
    m_pRenderTarget->FillEllipse(D2D1::Ellipse(D2D1::Point2F(dotX, dotY), dotRadius, dotRadius), m_pDotBrush);

    // Shift text down slightly (1.5f) for better visual centering within the dot
    D2D1_RECT_F dotTextRect = D2D1::RectF(dotX - dotRadius, dotY - dotRadius + 1.5f, dotX + dotRadius, dotY + dotRadius + 1.5f);
    std::wstring initials = state.profileInitials.empty() ? L"??" : state.profileInitials;
    m_pRenderTarget->DrawText(initials.c_str(), (UINT32)initials.length(), m_pTextFormatBold, dotTextRect, m_pTextBrush);

    if (!haloMode && size.width > 100.0f && !state.projectName.empty()) {
        // Add more spacing (28.0f) and tweak vertical bounds for perfect centering
        D2D1_RECT_F textRect = D2D1::RectF(dotX + 28.0f, 10.0f, size.width - 16.0f, size.height / 2.0f + 6.0f);
        m_pRenderTarget->DrawText(state.projectName.c_str(), (UINT32)state.projectName.length(), m_pTextFormatBold, textRect, m_pTextBrush);
        
        D2D1_RECT_F profileRect = D2D1::RectF(dotX + 28.0f, size.height / 2.0f + 6.0f, size.width - 16.0f, size.height - 10.0f);
        m_pRenderTarget->DrawText(state.currentProfile.c_str(), (UINT32)state.currentProfile.length(), m_pTextFormatNormal, profileRect, m_pTextBrush);
    }

    if (haloMode) {
        const float PI = 3.14159265358979323846f;
        for (int n = 1; n <= 8; n++) {
            float angle = (n - 1) * PI / 4.0f;
            float bx = center_x + std::sin(angle) * 58.0f;
            float by = center_y - std::cos(angle) * 58.0f;

            bool isHovered = (hoveredBubble == n);
            bool isAssigned = false;
            std::wstring folderPath = L"";
            for (const auto& l : links) {
                if (l.shortcut == std::to_wstring(n)) {
                    isAssigned = true;
                    folderPath = l.folderPath;
                    break;
                }
            }

            ID2D1SolidColorBrush* fillB = isHovered ? m_pHaloHoverBrush : (isAssigned ? m_pHaloAssignedBrush : m_pHaloEmptyBrush);
            ID2D1SolidColorBrush* borderB = isHovered ? m_pTextBrush : (isAssigned ? m_pHaloAssignedBorderBrush : m_pHaloEmptyBorderBrush);
            ID2D1SolidColorBrush* textB = isAssigned ? m_pTextBrush : m_pHaloEmptyTextBrush;
            float radius = isHovered ? 16.0f : 14.0f;
            float strokeW = isAssigned ? 1.5f : 1.0f;

            m_pRenderTarget->FillEllipse(D2D1::Ellipse(D2D1::Point2F(bx, by), radius, radius), fillB);
            m_pRenderTarget->DrawEllipse(D2D1::Ellipse(D2D1::Point2F(bx, by), radius, radius), borderB, strokeW);

            std::wstring numStr = std::to_wstring(n);
            D2D1_RECT_F textR = D2D1::RectF(bx - radius, by - radius, bx + radius, by + radius);
            m_pRenderTarget->DrawText(numStr.c_str(), (UINT32)numStr.length(), m_pTextFormatBold, textR, textB);

            if (isHovered && !folderPath.empty()) {
                size_t slashPos = folderPath.find_last_of(L"\\/");
                std::wstring baseName = (slashPos != std::wstring::npos) ? folderPath.substr(slashPos + 1) : folderPath;
                float lx = center_x + std::sin(angle) * 85.0f;
                float ly = center_y - std::cos(angle) * 85.0f;
                if (lx < 55.0f) lx = 55.0f;
                if (lx > 165.0f) lx = 165.0f;
                if (ly < 16.0f) ly = 16.0f;
                if (ly > 204.0f) ly = 204.0f;
                D2D1_RECT_F labelBox = D2D1::RectF(lx - 48.0f, ly - 11.0f, lx + 48.0f, ly + 11.0f);
                m_pRenderTarget->FillRoundedRectangle(D2D1::RoundedRect(labelBox, 6.0f, 6.0f), m_pBgBrush);
                m_pRenderTarget->DrawRoundedRectangle(D2D1::RoundedRect(labelBox, 6.0f, 6.0f), m_pHaloAssignedBorderBrush, 1.0f);
                m_pRenderTarget->DrawText(baseName.c_str(), (UINT32)baseName.length(), m_pTextFormatSmall ? m_pTextFormatSmall : m_pTextFormatNormal, labelBox, m_pTextBrush);
            }
        }
    }

    HRESULT hr = m_pRenderTarget->EndDraw();
    if (hr == D2DERR_RECREATE_TARGET) {
        DiscardResources();
    }
}
