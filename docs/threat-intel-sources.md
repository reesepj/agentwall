# Threat Intel Sources

Operational sources to keep Agentwall aligned with the current threat landscape:

- MITRE ATT&CK: https://attack.mitre.org/
- OSINT Framework: https://osintframework.com/
- VirusTotal API and similar enrichment providers as future optional integrations

Usage direction:
- MITRE ATT&CK for adversary behaviors, TTP mapping, detections, and test scenario design
- OSINT Framework for discovery/investigation workflows and research paths
- VirusTotal for enrichment of indicators, malware/signature context, and reputation research

Product tie-in ideas:
- map Agentwall detections/policies to ATT&CK techniques where relevant
- use VirusTotal-style enrichment for suspicious domains, hashes, URLs, and attachments in future triage panels
- use OSINT/ATT&CK-informed fixtures in the red-team battleground and training scenarios
