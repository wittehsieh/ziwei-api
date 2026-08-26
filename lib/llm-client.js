const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4.1';

class LlmError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'LlmError';
    this.status = status || 502;
  }
}

/**
 * @param {Array<{role:string, content:string}>} messages
 * @returns {Promise<string>} the assistant's reply text
 */
async function callLlm(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LlmError('伺服器未設定 OPENAI_API_KEY，無法呼叫 LLM', 500);
  }

  let response;
  try {
    response = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 1.0,
      }),
    });
  } catch (err) {
    throw new LlmError(`呼叫 OpenAI 失敗：${err.message || err}`, 502);
  }

  if (!response.ok) {
    let detail;
    try {
      const body = await response.json();
      detail = body.error && body.error.message ? body.error.message : JSON.stringify(body);
    } catch {
      detail = await response.text();
    }
    throw new LlmError(`OpenAI API 回傳錯誤（${response.status}）：${detail}`, 502);
  }

  const data = await response.json();
  const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!answer) {
    throw new LlmError('OpenAI API 回傳格式異常，缺少回答內容', 502);
  }
  return answer;
}

module.exports = { callLlm, LlmError, MODEL };
