<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>دستیار هوش مصنوعی SIMA</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js"></script>
    <style>
        :root {
            --bg: #f8fafc;
            --surface: #ffffff;
            --border: #e2e8f0;
            --text: #0f172a;
            --muted: #64748b;
            --brand: #4f46e5;
            --brand-soft: #eef2ff;
            --user: #4f46e5;
            --assistant: #f1f5f9;
            --error-bg: #fef2f2;
            --error-border: #fecaca;
            --error-text: #b91c1c;
            --widget-bg: #fff;
            --widget-border: #e2e8f0;
            --widget-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            background: var(--bg);
            color: var(--text);
            font-family: system-ui, -apple-system, "Segoe UI", Tahoma, "Iranian Sans", sans-serif;
            font-size: 15px;
            line-height: 1.7;
        }

        .shell {
            max-width: 860px;
            margin: 0 auto;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 1rem 1.5rem;
            background: var(--surface);
            border-bottom: 1px solid var(--border);
        }

        .brand { display: flex; align-items: center; gap: .75rem; }

        .logo {
            width: 38px; height: 38px;
            border-radius: 12px;
            background: var(--brand);
            color: #fff;
            display: grid; place-items: center;
            font-weight: 700;
        }

        .brand h1 { margin: 0; font-size: 1.05rem; }
        .brand p { margin: 0; font-size: .8rem; color: var(--muted); }

        .header-actions { display: flex; gap: .5rem; }

        .btn {
            border: 1px solid var(--border);
            background: var(--surface);
            color: var(--text);
            border-radius: 10px;
            padding: .45rem .8rem;
            font: inherit;
            font-size: .85rem;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: .35rem;
        }

        .btn:hover { background: var(--brand-soft); border-color: var(--brand); color: var(--brand); }
        .btn:disabled { opacity: .55; cursor: not-allowed; }

        #messages {
            flex: 1;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            overflow-y: auto;
        }

        .empty {
            margin: auto;
            text-align: center;
            color: var(--muted);
            max-width: 420px;
        }

        .empty h2 { color: var(--text); font-size: 1.1rem; margin: 0 0 .5rem; }

        .examples { display: flex; flex-direction: column; gap: .5rem; margin-top: 1rem; }

        .examples button {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: .6rem .8rem;
            font: inherit;
            font-size: .88rem;
            color: var(--text);
            cursor: pointer;
            text-align: start;
        }

        .examples button:hover { border-color: var(--brand); color: var(--brand); }

        .msg { display: flex; flex-direction: column; gap: .3rem; max-width: 82%; }
        .msg.user { align-self: flex-start; align-items: flex-start; }
        .msg.assistant { align-self: flex-end; align-items: flex-end; }

        .msg .role { font-size: .72rem; color: var(--muted); }

        .bubble {
            border-radius: 16px;
            padding: .75rem 1rem;
            white-space: pre-wrap;
            word-break: break-word;
            border: 1px solid var(--border);
        }

        .msg.user .bubble { background: var(--user); color: #fff; border-color: var(--user); }
        .msg.assistant .bubble { background: var(--assistant); }
        .msg.error .bubble { background: var(--error-bg); border-color: var(--error-border); color: var(--error-text); }

        .msg .bubble.widget {
            background: var(--widget-bg);
            border: 1px solid var(--widget-border);
            border-radius: 12px;
            padding: 1rem;
            box-shadow: var(--widget-shadow);
            white-space: normal;
        }

        .typing { display: inline-flex; gap: .25rem; padding: .2rem 0; }
        .typing span {
            width: 7px; height: 7px; border-radius: 50%;
            background: var(--muted);
            animation: blink 1.2s infinite;
        }
        .typing span:nth-child(2) { animation-delay: .2s; }
        .typing span:nth-child(3) { animation-delay: .4s; }

        @keyframes blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }

        footer {
            border-top: 1px solid var(--border);
            background: var(--surface);
            padding: 1rem 1.5rem;
        }

        .composer { display: flex; gap: .75rem; align-items: flex-end; }

        textarea {
            flex: 1;
            resize: none;
            min-height: 48px;
            max-height: 180px;
            padding: .7rem .9rem;
            border: 1px solid var(--border);
            border-radius: 14px;
            font: inherit;
            background: var(--bg);
            color: var(--text);
        }

        textarea:focus { outline: 2px solid var(--brand-soft); border-color: var(--brand); }

        .send {
            background: var(--brand);
            color: #fff;
            border: none;
            border-radius: 14px;
            padding: 0 1.4rem;
            height: 48px;
            font: inherit;
            font-weight: 600;
            cursor: pointer;
        }

        .send:disabled { opacity: .5; cursor: not-allowed; }

        .hint { margin: .5rem 0 0; font-size: .75rem; color: var(--muted); }
    </style>
</head>
<body>
<div class="shell">
    <header>
        <div class="brand">
            <div class="logo">S</div>
            <div>
                <h1>دستیار هوش مصنوعی SIMA</h1>
                <p>پاسخ‌گویی بر پایه داده‌های آگهی‌های شغلی JobVision</p>
            </div>
        </div>
        <div class="header-actions">
            <a class="btn" href="/">داشبورد</a>
            <button class="btn" id="clear" type="button">گفتگوی جدید</button>
        </div>
    </header>

    <main id="messages" aria-live="polite">
        <div class="empty" id="empty">
            <h2>چطور می‌توانم کمک کنم؟</h2>
            <p>پرسش خود را درباره آگهی‌های شغلی، مهارت‌های موردنیاز یا وضعیت استخدام بنویسید.</p>
            <div class="examples">
                <button type="button">چه شغل‌های فعالی داریم؟</button>
                <button type="button">برای برنامه‌نویس لاراول چه مهارت‌هایی لازم است؟</button>
                <button type="button">کدام شهرها بیشترین آگهی شغلی دارند؟</button>
            </div>
        </div>
    </main>

    <footer>
        <form class="composer" id="composer">
            <textarea id="input" rows="1" placeholder="پیام خود را بنویسید..." autocomplete="off"></textarea>
            <button class="send" id="send" type="submit">ارسال</button>
        </form>
        <p class="hint">Enter برای ارسال، Shift+Enter برای خط جدید</p>
    </footer>
</div>

<script>
    const ENDPOINT = '/api/v1/chat/query';
    const COLLECTION = 'jobvision-chat';
    const TOP_K = 5;
    const MODEL = 'youse';
    const SYSTEM_PROMPT = 'You are a helpful assistant for the JobVision system. Only answer questions related to JobVision job post data and available datasets. If a question is outside the scope of available data, respond that the data is not available in the current version. Answer in the same language the user asked in.';

    const messagesEl = document.getElementById('messages');
    const emptyEl = document.getElementById('empty');
    const form = document.getElementById('composer');
    const inputEl = document.getElementById('input');
    const sendEl = document.getElementById('send');

    let history = [];
    let sending = false;

    function scrollToEnd() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addMessage(role, content) {
        if (emptyEl) {
            emptyEl.remove();
            emptyEl = null;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'msg ' + role;

        const label = document.createElement('div');
        label.className = 'role';
        label.textContent = role === 'user' ? 'شما' : 'دستیار';

        const bubble = document.createElement('div');
        bubble.className = role === 'assistant' ? 'bubble widget' : 'bubble';
        if (role === 'assistant') {
            bubble.innerHTML = renderMarkdown(content || '');
        } else {
            bubble.textContent = content;
        }

        wrapper.appendChild(label);
        wrapper.appendChild(bubble);
        messagesEl.appendChild(wrapper);
        scrollToEnd();

        return bubble;
    }

    // Markdown rendering function (uses marked.js + DOMPurify)
    function renderMarkdown(text) {
        if (!text) return '';
        return DOMPurify.sanitize(marked.parse(text));
    }

    function addTypingIndicator() {
        const wrapper = document.createElement('div');
        wrapper.className = 'msg assistant';
        wrapper.id = 'typing';

        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';

        wrapper.appendChild(bubble);
        messagesEl.appendChild(wrapper);
        scrollToEnd();

        return wrapper;
    }

    async function sendMessage(text) {
        if (sending || !text.trim()) {
            return;
        }

        sending = true;
        sendEl.disabled = true;
        inputEl.disabled = true;

        history.push({ role: 'user', content: text });
        addMessage('user', text);
        const typing = addTypingIndicator();

        try {
            const response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
                    collection_id: COLLECTION,
                    top_k: TOP_K,
                    temperature: 0.3,
                    max_tokens: 1000
                })
            });

            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                const detail = payload?.messages
                    ? Object.values(payload.messages).flat().join(' ')
                    : (payload?.message || payload?.error || ('خطای ' + response.status));

                throw new Error(detail);
            }

            const answer = payload?.data?.choices?.[0]?.message?.content;

            if (!answer) {
                throw new Error('پاسخی از سرور دریافت نشد.');
            }

            typing.remove();
            addMessage('assistant', answer);
            history.push({ role: 'assistant', content: answer });
        } catch (error) {
            typing.remove();
            addMessage('error', 'خطا در ارتباط با دستیار: ' + error.message);
        } finally {
            sending = false;
            sendEl.disabled = false;
            inputEl.disabled = false;
            inputEl.focus();
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = inputEl.value;
        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendMessage(text);
    });

    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 180) + 'px';
    });

    inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            form.requestSubmit();
        }
    });

    document.getElementById('clear').addEventListener('click', () => {
        history = [];
        messagesEl.querySelectorAll('.msg').forEach((node) => node.remove());
        inputEl.focus();
    });

    document.querySelectorAll('.examples button').forEach((button) => {
        button.addEventListener('click', () => sendMessage(button.textContent.trim()));
    });
</script>
</body>
</html>
