#pragma once
#include <windows.h>
#include <ole2.h>
#include <shellapi.h>
#include <vector>
#include <string>
#include <functional>

#define WM_APP_DROP_FILES (WM_APP + 100)
#define WM_APP_UPDATE_STATE (WM_APP + 101)

struct DropPayload {
    std::vector<std::wstring> files;
    bool shiftPressed;
    bool ctrlPressed;
};

class DropHandler : public IDropTarget {
public:
    using DropCallback = std::function<void(const std::vector<std::wstring>& files, bool shiftPressed)>;

    DropHandler(HWND hWnd);
    virtual ~DropHandler();

    void SetDropCallback(DropCallback cb) { m_dropCallback = cb; }

    // IUnknown
    STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override;
    STDMETHODIMP_(ULONG) AddRef() override;
    STDMETHODIMP_(ULONG) Release() override;

    // IDropTarget
    STDMETHODIMP DragEnter(IDataObject* pDataObj, DWORD grfKeyState, POINTL pt, DWORD* pdwEffect) override;
    STDMETHODIMP DragOver(DWORD grfKeyState, POINTL pt, DWORD* pdwEffect) override;
    STDMETHODIMP DragLeave() override;
    STDMETHODIMP Drop(IDataObject* pDataObj, DWORD grfKeyState, POINTL pt, DWORD* pdwEffect) override;

private:
    LONG m_refCount;
    HWND m_hWnd;
    bool m_hasFiles;
    bool m_lastCtrl;
    bool m_lastShift;
    DropCallback m_dropCallback;
};
