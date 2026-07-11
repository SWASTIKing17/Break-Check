#include "IpcMessenger.h"
#include <iostream>
#include <sstream>
#include <vector>

// Helper to convert UTF-8 string to std::wstring
static std::wstring Utf8ToWstring(const std::string& str) {
    if (str.empty()) return std::wstring();
    int sizeNeeded = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(sizeNeeded, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], sizeNeeded);
    return wstrTo;
}

// Helper to convert std::wstring to UTF-8 string
static std::string WstringToUtf8(const std::wstring& wstr) {
    if (wstr.empty()) return std::string();
    int sizeNeeded = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(sizeNeeded, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], sizeNeeded, NULL, NULL);
    return strTo;
}

// Simple JSON string escape
static std::string EscapeJson(const std::wstring& wstr) {
    std::string s = WstringToUtf8(wstr);
    std::ostringstream o;
    for (char c : s) {
        if (c == '"') o << "\\\"";
        else if (c == '\\') o << "\\\\";
        else if (c == '\b') o << "\\b";
        else if (c == '\f') o << "\\f";
        else if (c == '\n') o << "\\n";
        else if (c == '\r') o << "\\r";
        else if (c == '\t') o << "\\t";
        else o << c;
    }
    return o.str();
}

// Minimal JSON parser helper for string field extraction
static std::wstring ExtractJsonString(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\":";
    size_t pos = json.find(searchKey);
    if (pos == std::string::npos) return L"";
    pos += searchKey.length();
    while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
    if (pos >= json.length() || json[pos] != '"') return L"";
    pos++;
    size_t endPos = pos;
    while (endPos < json.length()) {
        if (json[endPos] == '"' && json[endPos - 1] != '\\') break;
        endPos++;
    }
    std::string val = json.substr(pos, endPos - pos);
    std::string unescaped;
    for (size_t i = 0; i < val.length(); i++) {
        if (val[i] == '\\' && i + 1 < val.length()) {
            i++;
            if (val[i] == 'n') unescaped += '\n';
            else if (val[i] == 'r') unescaped += '\r';
            else if (val[i] == 't') unescaped += '\t';
            else unescaped += val[i];
        } else {
            unescaped += val[i];
        }
    }
    return Utf8ToWstring(unescaped);
}

static bool ExtractJsonBool(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\":";
    size_t pos = json.find(searchKey);
    if (pos == std::string::npos) return false;
    pos += searchKey.length();
    while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
    if (pos < json.length() && json[pos] == 't') return true;
    return false;
}

static int ExtractJsonInt(const std::string& json, const std::string& key, int defaultVal) {
    std::string searchKey = "\"" + key + "\":";
    size_t pos = json.find(searchKey);
    if (pos == std::string::npos) return defaultVal;
    pos += searchKey.length();
    while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
    size_t endPos = pos;
    while (endPos < json.length() && (isdigit(json[endPos]) || json[endPos] == '-')) endPos++;
    if (endPos > pos) {
        try {
            return std::stoi(json.substr(pos, endPos - pos));
        } catch (...) {
            return defaultVal;
        }
    }
    return defaultVal;
}

IpcMessenger::IpcMessenger() : m_hPipe(INVALID_HANDLE_VALUE), m_hThread(NULL), m_running(false) {
    InitializeCriticalSection(&m_csWrite);
}

IpcMessenger::~IpcMessenger() {
    Stop();
    DeleteCriticalSection(&m_csWrite);
}

bool IpcMessenger::Start(const std::wstring& pipeName) {
    m_pipeName = pipeName;
    m_running = true;
    m_hThread = CreateThread(NULL, 0, ThreadProc, this, 0, NULL);
    return m_hThread != NULL;
}

void IpcMessenger::Stop() {
    m_running = false;
    if (m_hPipe != INVALID_HANDLE_VALUE) {
        CloseHandle(m_hPipe);
        m_hPipe = INVALID_HANDLE_VALUE;
    }
    if (m_hThread) {
        WaitForSingleObject(m_hThread, 1000);
        CloseHandle(m_hThread);
        m_hThread = NULL;
    }
}

DWORD WINAPI IpcMessenger::ThreadProc(LPVOID lpParam) {
    IpcMessenger* self = static_cast<IpcMessenger*>(lpParam);
    self->RunLoop();
    return 0;
}

void IpcMessenger::RunLoop() {
    while (m_running) {
        m_hPipe = CreateFileW(
            m_pipeName.c_str(),
            GENERIC_READ | GENERIC_WRITE,
            0,
            NULL,
            OPEN_EXISTING,
            0,
            NULL
        );

        if (m_hPipe != INVALID_HANDLE_VALUE) {
            // Connected! Send status request
            WriteLine("{\"type\":\"request-status\"}");

            char buffer[4096];
            DWORD bytesRead, bytesAvail;
            std::string lineBuf;

            while (m_running) {
                // Check if incoming data is ready without blocking synchronous handle
                bytesAvail = 0;
                if (!PeekNamedPipe(m_hPipe, NULL, 0, NULL, &bytesAvail, NULL)) {
                    break; // Pipe disconnected or error
                }

                if (bytesAvail > 0) {
                    if (ReadFile(m_hPipe, buffer, sizeof(buffer) - 1, &bytesRead, NULL) && bytesRead > 0) {
                        buffer[bytesRead] = '\0';
                        lineBuf += buffer;
                        size_t pos;
                        while ((pos = lineBuf.find('\n')) != std::string::npos) {
                            std::string line = lineBuf.substr(0, pos);
                            lineBuf.erase(0, pos + 1);
                            if (!line.empty() && line.back() == '\r') line.pop_back();
                            if (!line.empty()) {
                                ParseMessage(line);
                            }
                        }
                    } else {
                        break;
                    }
                }

                // Send queued outgoing messages
                std::vector<std::string> toSend;
                EnterCriticalSection(&m_csWrite);
                toSend.swap(m_outQueue);
                LeaveCriticalSection(&m_csWrite);

                for (const auto& payload : toSend) {
                    DWORD bytesWritten;
                    if (!WriteFile(m_hPipe, payload.c_str(), (DWORD)payload.size(), &bytesWritten, NULL)) {
                        break;
                    }
                }

                Sleep(10);
            }
            CloseHandle(m_hPipe);
            m_hPipe = INVALID_HANDLE_VALUE;
        }
        Sleep(1000); // Retry connection every second
    }
}

void IpcMessenger::WriteLine(const std::string& line) {
    EnterCriticalSection(&m_csWrite);
    m_outQueue.push_back(line + "\n");
    LeaveCriticalSection(&m_csWrite);
}

void IpcMessenger::ParseMessage(const std::string& line) {
    std::wstring type = ExtractJsonString(line, "type");
    if (type == L"overlay-update") {
        ProjectState state;
        state.connected = ExtractJsonBool(line, "connected");
        state.projectName = ExtractJsonString(line, "projectName");
        state.nativeProjectName = ExtractJsonString(line, "nativeProjectName");
        state.currentProfile = ExtractJsonString(line, "currentProfile");
        state.profileInitials = ExtractJsonString(line, "profileInitials");
        state.profileColorR = ExtractJsonInt(line, "profileColorR", 124);
        state.profileColorG = ExtractJsonInt(line, "profileColorG", 58);
        state.profileColorB = ExtractJsonInt(line, "profileColorB", 237);
        if (m_stateCallback) m_stateCallback(state);
    } else if (type == L"overlay-link-map") {
        std::vector<LinkEntry> links;
        size_t dataPos = line.find("\"data\":[");
        if (dataPos != std::string::npos) {
            size_t start = line.find('{', dataPos);
            while (start != std::string::npos) {
                size_t end = line.find('}', start);
                if (end == std::string::npos) break;
                std::string objStr = line.substr(start, end - start + 1);
                LinkEntry entry;
                entry.folderPath = ExtractJsonString(objStr, "folderPath");
                entry.binName = ExtractJsonString(objStr, "binName");
                entry.shortcut = ExtractJsonString(objStr, "shortcut");
                links.push_back(entry);
                start = line.find('{', end);
            }
        }
        if (m_linkMapCallback) m_linkMapCallback(links);
    } else if (type == L"reposition") {
        if (m_cmdCallback) m_cmdCallback("reposition");
    } else if (type == L"quit") {
        if (m_cmdCallback) m_cmdCallback("quit");
    }
}

void IpcMessenger::SendDropImport(const std::vector<std::wstring>& filePaths, bool moveSource, bool ctrlPressed, const std::wstring& routeToFolder, const std::wstring& routeToBin) {
    std::ostringstream ss;
    ss << "{\"type\":\"import-dropped-files\",\"filePaths\":[";
    for (size_t i = 0; i < filePaths.size(); i++) {
        if (i > 0) ss << ",";
        ss << "\"" << EscapeJson(filePaths[i]) << "\"";
    }
    ss << "],\"opts\":{\"moveSource\":" << (moveSource ? "true" : "false") << ",\"ctrlKey\":" << (ctrlPressed ? "true" : "false");
    if (!routeToFolder.empty()) {
        ss << ",\"routeToFolder\":\"" << EscapeJson(routeToFolder) << "\"";
    }
    if (!routeToBin.empty()) {
        ss << ",\"routeToBin\":\"" << EscapeJson(routeToBin) << "\"";
    }
    ss << "}}";
    WriteLine(ss.str());
}

void IpcMessenger::SendBrowserImageImport(const std::wstring& url) {
    std::ostringstream ss;
    ss << "{\"type\":\"import-browser-image\",\"url\":\"" << EscapeJson(url) << "\"}";
    WriteLine(ss.str());
}

void IpcMessenger::SendLog(const std::string& level, const std::string& eventName, const std::string& payloadJson) {
    std::ostringstream ss;
    ss << "{\"type\":\"log\",\"level\":\"" << level << "\",\"event\":\"" << eventName << "\",\"payload\":" << (payloadJson.empty() ? "{}" : payloadJson) << "}";
    WriteLine(ss.str());
}

void IpcMessenger::SendCycleProfile() {
    WriteLine("{\"type\":\"cycle-profile\"}");
}
