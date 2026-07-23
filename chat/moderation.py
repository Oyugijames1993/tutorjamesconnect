# chat/moderation.py
# chat/moderation.py
import re

# ── Currency and price discussion ─────────────────────────────────────────────
# Tightened from the original version, which held ANY message containing
# ordinary words like "rate", "total", "amount", "how many", "cheap",
# "afford", "offer", "deal" — these fire constantly in normal project chat
# ("what's the completion rate", "how many pages", "afford the time to
# review this") and, since price detection is now auto-delivered with no
# human review step, a false positive here silently hides an ordinary
# message from the provider instead of just delaying it. This version
# requires either a currency symbol/code, a number next to a currency
# word, or an explicit price/payment phrase — not a single generic word.
CURRENCY_SYMBOL_RE = re.compile(r'[\$£€¥₦₹₨]')

CURRENCY_CODE_RE = re.compile(
    r'\b(kes|ksh|usd|eur|gbp|ngn|aed|sar|inr|pkr)\b',
    re.IGNORECASE
)

NUMBER_NEAR_MONEY_RE = re.compile(
    r'\d+\s*(kes|ksh|usd|eur|gbp|dollars?|shillings?|naira|pounds?|bucks?)\b'
    r'|(kes|ksh|usd|eur|gbp|dollars?|shillings?|naira|pounds?|bucks?)\s*\d+',
    re.IGNORECASE
)

STRONG_PRICE_PHRASE_RE = re.compile(
    r'\bhow\s+much\s+(does|will|would|is|for)\b'
    r'|\bwhat\s+(is|are|\'s)\s+the\s+(price|cost|rate|fee|charge)\b'
    r'|\bprice\s+(is|for|of|list)\b'
    r'|\bquote\s+(me|for|is|you)\b'
    r'|\bpayment\s+(plan|method|methods|details|terms|link)\b'
    r'|\bpay\s+(me|you|upfront|in\s+advance|now)\b'
    r'|\binvoice\b'
    r'|\bbudget\s+(is|for|of)\b'
    r'|\bnegotiate\s+(the\s+)?(price|rate|fee)\b'
    r'|\bdiscount\b'
    r'|\bper\s+(word|hour|page|project|assignment)\b'
    r'|\b(pay|paid|cost|fee|charge)(s)?\b',
    re.IGNORECASE
)


def is_price_related(body):
    return bool(
        CURRENCY_SYMBOL_RE.search(body) or
        CURRENCY_CODE_RE.search(body) or
        NUMBER_NEAR_MONEY_RE.search(body) or
        STRONG_PRICE_PHRASE_RE.search(body)
    )


# ── Phone numbers (numeric) ───────────────────────────────────────────────────
# The original version had a bug: the "common country codes" fallback matched
# bare "+1" or "+7" with NO digits required afterward — so "+1 for that idea"
# or a stray "+7" would be flagged as a phone number. The first alternative
# below already robustly covers real international numbers (8+ digit-ish
# characters after an optional +), so the redundant/buggy country-code-only
# fallback has been removed rather than patched.
PHONE_RE = re.compile(
    # International format with country code
    r'(\+?\d[\d\s\-()\u200B]{7,})'

    # Local format e.g. 0712345678
    r'|(\b0\d{9,10}\b)'

    # USA/Canada formats
    r'|(\b1[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}\b)'
    r'|(\(\d{3}\)[\s\-]?\d{3}[\s\-]?\d{4})'
    r'|(\b\d{3}[\s\-]\d{3}[\s\-]\d{4}\b)'
    r'|(\b\d{10}\b)',
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
ACTION_SEND          = 'send'           # deliver immediately, as requested
ACTION_HOLD          = 'hold'           # save as pending, notify admin, needs manual approve/reject
ACTION_BLOCK         = 'block'          # reject outright, not saved
ACTION_REDIRECT_ADMIN = 'redirect_admin'  # deliver immediately, but force target to admin-only — no approval needed


def moderate_message(sender_role, body):
    """
    Moderate messages from both providers and clients.
    Admin messages are never moderated.

    Returns (action, reason):
        send           — deliver immediately, as requested
        redirect_admin — deliver immediately, but silently force the
                          message to be admin-only visible (price/payment
                          talk). No approval needed — this just keeps
                          money discussion between admin and the sender,
                          out of the general project conversation.
        hold           — save as pending, notify admin, needs a manual
                          approve/reject (contact-sharing attempts — these
                          get a human look since they can be a deliberate
                          attempt to move the relationship off-platform).
        block          — reject, not saved
    """
    # Admin messages are never moderated
    if sender_role == 'admin':
        return ACTION_SEND, None

    # ── Price/payment discussion — auto-redirect to admin-only, no approval ──
    if is_price_related(body):
        return ACTION_REDIRECT_ADMIN, 'Price or payment discussion — kept between you and the admin.'

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