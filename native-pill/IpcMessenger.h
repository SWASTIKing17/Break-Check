#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include <functional>

struct ProjectState {
    bool connected = false;
    std::wstring projectName;
    std::wstring nativeProjectName;
    std::wstring currentProfile;
    std::wstring profileInitials;
    int profileColorR = 124;
    int profileColorG = 58;
    int profileColorB = 237;
};

struct LinkEntry {
    std::wstring folderPath;
    std::wstring binName;
    std::wstring shortcut;
};

class IpcMessenger {
public:
    using StateCallback = std::function<void(const ProjectState&)>;
    using LinkMapCallback = std::function<void(const std::vector<LinkEntry>&)>;
    using CommandCallback = std::function<void(const std::string&)>;

    IpcMessenger();
    ~IpcMessenger();

    bool Start(const std::wstring& pipeName);
    void Stop();

    void SendDropImport(const std::vector<std::wstring>& filePaths, bool moveSource, bool ctrlPressed, const std::wstring& routeToFolder, const std::wstring& routeToBin = L"");
    void SendBrowserImageImport(const std::wstring& url);
    void SendLog(const std::string& level, const std::string& eventName, const std::string& payloadJson);
    void SendCycleProfile();

    void SetStateCallback(StateCallback cb) { m_stateCallback = cb; }
    void SetLinkMapCallback(LinkMapCallback cb) { m_linkMapCallback = cb; }
    void SetCommandCallback(CommandCallback cb) { m_cmdCallback = cb; }

private:
    static DWORD WINAPI ThreadProc(LPVOID lpParam);
    void RunLoop();
    void ParseMessage(const std::string& line);
    void WriteLine(const std::string& line);

    std::wstring m_pipeName;
    HANDLE m_hPipe;
    HANDLE m_hThread;
    bool m_running;
    CRITICAL_SECTION m_csWrite;
    std::vector<std::string> m_outQueue;

    StateCallback m_stateCallback;
    LinkMapCallback m_linkMapCallback;
    CommandCallback m_cmdCallback;
};
