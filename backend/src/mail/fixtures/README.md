The loopback SMTP tests generate a fresh certificate and private key with OpenSSL for each test run.
On Windows they use OpenSSL bundled with Git for Windows; on Linux/macOS OpenSSL must be on PATH.
Temporary PEM files are deleted immediately after loading. No certificate or private key is committed.
Tests explicitly trust the generated certificate and keep certificate and hostname verification enabled.
