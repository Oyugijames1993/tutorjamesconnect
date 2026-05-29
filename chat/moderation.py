# chat/moderation.py
import re

# ── Currency and price discussion ─────────────────────────────────────────────
PRICE_RE = re.compile(
    r'\b(kd|usd|eur|gbp|ksh|kes|ngn|aed|sar|inr|pkr|price|prices|'
    r'pay|paid|payment|payments|cost|costs|fee|fees|rate|rates|'
    r'quote|quotes|budget|charge|charges|invoice|'
    r'per\s+word|per\s+hour|per\s+project|'
    r'how\s+much|how\s+many|total|amount|'
    r'cheap|expensive|afford|discount|offer|deal)\b'
    r'|[\$£€¥₦₹₨]',
    re.IGNORECASE
)

# ── Phone numbers (numeric) ───────────────────────────────────────────────────
PHONE_RE = re.compile(
    # International format with country code
    r'(\+?\d[\d\s\-()\u200B]{7,})'

    # Country code + digit e.g. +254 7, +1 800
    r'|(\+\d{1,3}[\s\-]?\d)'

    # International prefix e.g. 00254, 001
    r'|(\b00\d{1,3}[\s\-]?\d)'

    # Local format e.g. 0712345678
    r'|(\b0\d{9,10}\b)'

    # USA/Canada formats
    r'|(\b1[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}\b)'
    r'|(\(\d{3}\)[\s\-]?\d{3}[\s\-]?\d{4})'
    r'|(\b\d{3}[\s\-]\d{3}[\s\-]\d{4}\b)'
    r'|(\b\d{10}\b)'

    # Common country codes +1 to +99
    r'|(\+1|\+2[0-9]|\+3[0-9]|\+4[0-9]'
    r'|\+5[0-9]|\+6[0-9]|\+7|\+8[0-9]'
    r'|\+9[0-9])',
    re.IGNORECASE
)

# ── Spoken/written phone numbers ──────────────────────────────────────────────
SPOKEN_PHONE_RE = re.compile(
    # Written digits
    r'\b(zero|one|two|three|four|five|six|seven|eight|nine|oh|nought)'
    r'[\s\-,]*'
    r'(zero|one|two|three|four|five|six|seven|eight|nine|oh|nought)'
    r'[\s\-,]*'
    r'(zero|one|two|three|four|five|six|seven|eight|nine|oh|nought)'
    r'[\s\-,]*'
    r'(zero|one|two|three|four|five|six|seven|eight|nine|oh|nought)\b'

    # Written country codes
    r'|plus\s+(one|two|three|four|five|six|seven|eight|nine)'  # plus one, plus two
    r'|\bplus\s+\d{1,3}\b'                                     # plus 254
    r'|\bplus\s+(two\s+five\s+four'                            # plus two five four (Kenya)
    r'|nine\s+six\s+five'                                      # nine six five (Kuwait)
    r'|four\s+four'                                            # four four (UK)
    r'|nine\s+seven\s+one'                                     # nine seven one (UAE)
    r'|nine\s+six\s+six'                                       # nine six six (Saudi)
    r'|two\s+three\s+four'                                     # two three four (Nigeria)
    r'|two\s+seven'                                            # two seven (South Africa)
    r'|nine\s+one'                                             # nine one (India)
    r'|six\s+one'                                              # six one (Australia)
    r'|three\s+five\s+three)\b',                               # three five three (Ireland)
    re.IGNORECASE
)

# ── Email addresses ───────────────────────────────────────────────────────────
EMAIL_RE = re.compile(
    r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'
)

# ── Social media handles and platforms ───────────────────────────────────────
SOCIAL_RE = re.compile(
    r'@[\w]{2,}|instagram|whatsapp|telegram|snapchat|'
    r'facebook|twitter|tiktok|linkedin|skype|zoom|'
    r'signal|viber|line|wechat|discord',
    re.IGNORECASE
)

# ── Contact sharing (direct contact attempts) ─────────────────────────────────
CONTACT_RE = re.compile(
    r'\b(contact\s+me|reach\s+me|call\s+me|text\s+me|message\s+me|'
    r'dm\s+me|find\s+me|add\s+me|follow\s+me|connect\s+with\s+me|'
    r'my\s+number|my\s+email|my\s+phone|my\s+contact|'
    r'phone\s+number|cell\s+number|mobile\s+number|'
    r'reach\s+out|get\s+in\s+touch|'
    r'zero\s+seven|zero\s+eight|zero\s+nine|'
    r'oh\s+seven|oh\s+eight|oh\s+nine)\b',
    re.IGNORECASE
)

# ── Actions ───────────────────────────────────────────────────────────────────
ACTION_SEND  = 'send'
ACTION_HOLD  = 'hold'
ACTION_BLOCK = 'block'


def moderate_message(sender_role, body):
    """
    Moderate messages from both providers and clients.
    Admin messages are never moderated.
    Returns (action, reason):
        send  — deliver immediately
        hold  — save as pending, notify admin
        block — reject, not saved
    """
    # Admin messages are never moderated
    if sender_role == 'admin':
        return ACTION_SEND, None

    # ── Price/payment discussion — HOLD for admin review ──────────────────
    if PRICE_RE.search(body):
        return ACTION_HOLD, 'Price or payment discussion detected — pending admin review.'

    # ── Numeric phone number — HOLD for admin review ──────────────────────
    if PHONE_RE.search(body):
        return ACTION_HOLD, 'Phone number detected — pending admin review.'

    # ── Spoken/written phone number — HOLD for admin review ───────────────
    if SPOKEN_PHONE_RE.search(body):
        return ACTION_HOLD, 'Written phone number detected — pending admin review.'

    # ── Email address — HOLD for admin review ────────────────────────────
    if EMAIL_RE.search(body):
        return ACTION_HOLD, 'Email address detected — pending admin review.'

    # ── Social media — HOLD for admin review ─────────────────────────────
    if SOCIAL_RE.search(body):
        return ACTION_HOLD, 'Social media reference detected — pending admin review.'

    # ── Direct contact attempt — HOLD for admin review ───────────────────
    if CONTACT_RE.search(body):
        return ACTION_HOLD, 'Contact information detected — pending admin review.'

    return ACTION_SEND, None