#include <initguid.h>
#include "DropHandler.h"

DropHandler::DropHandler(HWND hWnd) : m_refCount(1), m_hWnd(hWnd), m_hasFiles(false), m_lastCtrl(false), m_lastShift(false) {}

DropHandler::~DropHandler() {}

STDMETHODIMP DropHandler::QueryInterface(REFIID riid, void** ppv) {
    if (riid == IID_IUnknown || riid == IID_IDropTarget) {
        *ppv = static_cast<IDropTarget*>(this);
        AddRef();
        return S_OK;
    }
    *ppv = NULL;
    return E_NOINTERFACE;
}

STDMETHODIMP_(ULONG) DropHandler::AddRef() {
    return InterlockedIncrement(&m_refCount);
}

STDMETHODIMP_(ULONG) DropHandler::Release() {
    LONG count = InterlockedDecrement(&m_refCount);
    if (count == 0) {
        delete this;
        return 0;
    }
    return count;
}

STDMETHODIMP DropHandler::DragEnter(IDataObject* pDataObj, DWORD grfKeyState, POINTL pt, DWORD* pdwEffect) {
    FORMATETC fmt = { CF_HDROP, NULL, DVASPECT_CONTENT, -1, TYMED_HGLOBAL };
    m_hasFiles = (pDataObj->QueryGetData(&fmt) == S_OK);
    if (m_hasFiles) {
        m_lastShift = ((grfKeyState & MK_SHIFT) != 0) || ((GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0);
        m_lastCtrl = ((grfKeyState & MK_CONTROL) != 0) || ((GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0);
        *pdwEffect = m_lastShift ? DROPEFFECT_MOVE : DROPEFFECT_COPY;
    } else {
        *pdwEffect = DROPEFFECT_NONE;
    }
    return S_OK;
}

STDMETHODIMP DropHandler::DragOver(DWORD grfKeyState, POINTL pt, DWORD* pdwEffect) {
    if (m_hasFiles) {
        m_lastShift = ((grfKeyState & MK_SHIFT) != 0) || ((GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0);
        m_lastCtrl = ((grfKeyState & MK_CONTROL) != 0) || ((GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0);
        *pdwEffect = m_lastShift ? DROPEFFECT_MOVE : DROPEFFECT_COPY;
    } else {
        *pdwEffect = DROPEFFECT_NONE;
    }
    return S_OK;
}

STDMETHODIMP DropHandler::DragLeave() {
    m_hasFiles = false;
    m_lastCtrl = false;
    m_lastShift = false;
    return S_OK;
}

STDMETHODIMP DropHandler::Drop(IDataObject* pDataObj, DWORD grfKeyState, POINTL pt, DWORD* pdwEffect) {
    if (!m_hasFiles) {
        *pdwEffect = DROPEFFECT_NONE;
        return S_OK;
    }

    bool shiftPressed = m_lastShift || ((grfKeyState & MK_SHIFT) != 0) || ((GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0);
    bool ctrlPressed = m_lastCtrl || ((grfKeyState & MK_CONTROL) != 0) || ((GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0);
    *pdwEffect = shiftPressed ? DROPEFFECT_MOVE : DROPEFFECT_COPY;

    FORMATETC fmt = { CF_HDROP, NULL, DVASPECT_CONTENT, -1, TYMED_HGLOBAL };
    STGMEDIUM stg = { 0 };
    if (pDataObj->GetData(&fmt, &stg) == S_OK) {
        HDROP hDrop = (HDROP)GlobalLock(stg.hGlobal);
        if (hDrop) {
            UINT count = DragQueryFileW(hDrop, 0xFFFFFFFF, NULL, 0);
            std::vector<std::wstring> files;
            for (UINT i = 0; i < count; i++) {
                UINT len = DragQueryFileW(hDrop, i, NULL, 0);
                std::wstring path(len + 1, 0);
                DragQueryFileW(hDrop, i, &path[0], len + 1);
                path.resize(len);
                files.push_back(path);
            }
            GlobalUnlock(stg.hGlobal);
            if (!files.empty()) {
                DropPayload* payload = new DropPayload{ files, shiftPressed, ctrlPressed };
                PostMessage(m_hWnd, WM_APP_DROP_FILES, (WPARAM)payload, 0);
            }
        }
        ReleaseStgMedium(&stg);
    }
    m_hasFiles = false;
    return S_OK;
}
