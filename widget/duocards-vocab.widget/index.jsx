import { run } from 'uebersicht';

export const refreshFrequency = 60000;

export const initialState = {
  tab: 'visible',
  items: [],
  hiddenItems: [],
  remaining: 0,
  hidden: 0,
  error: null,
  lastUpdated: '',
  refreshing: false,
  statusMessage: '',
  totalWords: 0,
  lastSuccessAt: '',
  addedCount: 0,
  removedCount: 0,
  previousCount: 0,
};

const hiddenFile = '~/Documents/duocards-widget/output/hidden-words.json';

const loadCommand = `
ruby -rjson -rset -e '
file = File.expand_path("~/Documents/duocards-widget/output/vocab.json")
hidden_file = File.expand_path("~/Documents/duocards-widget/output/hidden-words.json")
history_file = File.expand_path("~/Documents/duocards-widget/logs/fetch-vocab.history.log")

begin
  data = JSON.parse(File.read(file))
  cards = data.is_a?(Array) ? data : (data["cards"] || data["items"] || data["data"] || [])

  hidden_words = if File.exist?(hidden_file)
    parsed = JSON.parse(File.read(hidden_file))
    parsed.is_a?(Array) ? parsed : []
  else
    []
  end

  history = { timestamp: "", old: 0, new: 0, added: 0, removed: 0 }

  if File.exist?(history_file)
    last_line = File.readlines(history_file, chomp: true).reject(&:empty?).last
    if last_line
      parts = last_line.split(" | ")
      history[:timestamp] = parts[0] || ""

      parts[1..].to_a.each do |part|
        key, value = part.split("=", 2)
        history[key.to_sym] = value.to_i if key && value
      end
    end
  end

  hidden_set = hidden_words.to_set

  normalized_cards = cards.map do |card|
    {
      word: card["word"] || card["front"] || card["original"] || card["term"] || "Unknown",
      translation: card["translation"] || card["back"] || card["meaning"] || "",
      example: card["example"] || card["sentence"] || ""
    }
  end

  visible_items = normalized_cards.reject { |card| hidden_set.include?(card[:word]) }
  hidden_items = normalized_cards.select { |card| hidden_set.include?(card[:word]) }

  puts({
    items: visible_items.first(10),
    hiddenItems: hidden_items,
    remaining: visible_items.length,
    hidden: hidden_items.length,
    totalWords: normalized_cards.length,
    lastSuccessAt: history[:timestamp],
    previousCount: history[:old],
    addedCount: history[:added],
    removedCount: history[:removed]
  }.to_json)
rescue => e
  puts({
    items: [{ word: "Waiting for DuoCards data", translation: "", example: e.message }],
    hiddenItems: [],
    remaining: 0,
    hidden: 0,
    totalWords: 0,
    lastSuccessAt: "",
    previousCount: 0,
    addedCount: 0,
    removedCount: 0
  }.to_json)
end
'
`;

const formatTime = () => {
  const now = new Date();
  return now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const formatHistoryTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString([], {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const reloadData = (dispatch) => {
  run(loadCommand)
    .then((output) => {
      dispatch({ type: 'DATA_LOADED', output, time: formatTime() });
    })
    .catch((error) => {
      dispatch({ type: 'DATA_ERROR', error: String(error) });
    });
};

const refreshWidget = async (dispatch) => {
  dispatch({ type: 'REFRESH_STARTED' });

  try {
    await run('/bin/zsh -l -c \'cd ~/Documents/duocards-widget && node scripts/fetch-vocab.js\'');
    reloadData(dispatch);
  } catch (e) {
    dispatch({ type: 'REFRESH_FAILED', error: String(e) });
  }
};

export const command = (dispatch) => {
  reloadData(dispatch);
};

export const updateState = (event, previousState) => {
  switch (event.type) {
    case 'DATA_LOADED': {
      try {
        const data = JSON.parse(event.output);
        return {
          ...previousState,
          items: Array.isArray(data.items) ? data.items : [],
          hiddenItems: Array.isArray(data.hiddenItems) ? data.hiddenItems : [],
          remaining: data.remaining || 0,
          hidden: data.hidden || 0,
          error: null,
          refreshing: false,
          lastUpdated: event.time || previousState.lastUpdated,
          statusMessage: event.time ? 'Updated successfully' : previousState.statusMessage,
          totalWords: data.totalWords || 0,
          lastSuccessAt: data.lastSuccessAt || '',
          addedCount: data.addedCount || 0,
          removedCount: data.removedCount || 0,
          previousCount: data.previousCount || 0,
        };
      } catch (e) {
        return {
          ...previousState,
          error: String(e),
          refreshing: false,
          statusMessage: 'Refresh failed',
        };
      }
    }

    case 'DATA_ERROR':
      return {
        ...previousState,
        error: event.error,
        refreshing: false,
        statusMessage: 'Refresh failed',
      };

    case 'SET_TAB':
      return {
        ...previousState,
        tab: event.tab === 'hidden' ? 'hidden' : 'visible',
      };

    case 'REFRESH_STARTED':
      return {
        ...previousState,
        refreshing: true,
        statusMessage: 'Updating...',
      };

    case 'REFRESH_FAILED':
      return {
        ...previousState,
        error: event.error,
        refreshing: false,
        statusMessage: 'Refresh failed',
      };

    default:
      return previousState;
  }
};

export const className = `
  top: 88px;
  right: 150px;
  width: 470px;
`;

const speak = (text) => {
  if (!text) return;
  const safe = String(text).replace(/"/g, '\\"');
  run(`say -v Anna "${safe}"`).catch(() => {});
};

const addHiddenWord = async (word, dispatch) => {
  if (!word) return;

  const safeWord = JSON.stringify(String(word));
  const safePath = JSON.stringify(hiddenFile);

  const command = `python3 -c 'import json, os; file=os.path.expanduser(${safePath}); word=${safeWord}; words=[];
try:
    words=json.load(open(file))
    if not isinstance(words, list): words=[]
except:
    words=[]
if word not in words:
    words.append(word)
with open(file, "w") as f:
    json.dump(words, f, ensure_ascii=False, indent=2)
'`;

  try {
    await run(command);
    reloadData(dispatch);
  } catch (e) {
    console.error('addHiddenWord failed', e);
  }
};

const removeHiddenWord = async (word, dispatch) => {
  if (!word) return;

  const safeWord = JSON.stringify(String(word));
  const safePath = JSON.stringify(hiddenFile);

  const command = `python3 -c 'import json, os; file=os.path.expanduser(${safePath}); word=${safeWord}; words=[];
try:
    words=json.load(open(file))
    if not isinstance(words, list): words=[]
except:
    words=[]
words=[w for w in words if w != word]
with open(file, "w") as f:
    json.dump(words, f, ensure_ascii=False, indent=2)
'`;

  try {
    await run(command);
    reloadData(dispatch);
  } catch (e) {
    console.error('removeHiddenWord failed', e);
  }
};

const boxStyle = {
  background: "rgba(18,18,18,0.74)",
  color: "#fff",
  padding: "12px 14px",
  borderRadius: "16px",
  fontFamily: "SF Pro Display, Inter, sans-serif",
  boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  lineHeight: 1.3,
};

const titleTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "8px",
  marginBottom: "10px",
};

const titleLeftStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "4px",
  minWidth: 0,
  flex: 1,
};

const titleMainRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  minWidth: 0,
};

const titleStyle = {
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#94a3b8",
};

const statsStyle = {
  fontSize: "10px",
  color: "#64748b",
  whiteSpace: "nowrap",
};

const refreshStyle = {
  border: "none",
  background: "rgba(255,255,255,0.08)",
  color: "#cbd5e1",
  borderRadius: "999px",
  width: "18px",
  height: "18px",
  minWidth: "18px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "10px",
  lineHeight: 1,
  padding: 0,
};

const refreshMetaStyle = {
  fontSize: "9px",
  color: "#64748b",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "260px",
};

const refreshDetailsStyle = {
  fontSize: "9px",
  color: "#64748b",
  lineHeight: 1.35,
  whiteSpace: "pre-line",
};

const tabsStyle = {
  display: "flex",
  gap: "6px",
  marginBottom: "10px",
};

const tabButtonStyle = (active) => ({
  border: "none",
  borderRadius: "999px",
  padding: "4px 10px",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  cursor: "pointer",
  color: active ? "#0f172a" : "#cbd5e1",
  background: active ? "#7dd3fc" : "rgba(255,255,255,0.08)",
});

const itemStyle = {
  padding: "8px 0",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const lastItemStyle = {
  padding: "8px 0 0 0",
};

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const exampleRowStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "6px",
  marginTop: "4px",
};

const wordStyle = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#7dd3fc",
  margin: 0,
  flex: 1,
};

const transStyle = {
  fontSize: "12px",
  color: "#f8fafc",
  margin: "3px 0 0 24px",
};

const exStyle = {
  fontSize: "11px",
  color: "#cbd5e1",
  opacity: 0.9,
  flex: 1,
  lineHeight: 1.45,
  margin: 0,
};

const speakerStyle = {
  border: "none",
  background: "rgba(255,255,255,0.06)",
  color: "#cbd5e1",
  borderRadius: "999px",
  width: "18px",
  height: "18px",
  minWidth: "18px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "9px",
  lineHeight: 1,
  padding: 0,
  marginTop: "1px",
};

const actionStyle = {
  border: "none",
  background: "rgba(34,197,94,0.16)",
  color: "#86efac",
  borderRadius: "999px",
  width: "18px",
  height: "18px",
  minWidth: "18px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "10px",
  lineHeight: 1,
  padding: 0,
  marginTop: "1px",
};

const restoreStyle = {
  ...actionStyle,
  background: "rgba(125,211,252,0.16)",
  color: "#7dd3fc",
};

export const render = (state = initialState, dispatch) => {
  const isHiddenTab = state.tab === 'hidden';
  const visibleItems = Array.isArray(state.items) ? state.items : [];
  const hiddenItems = Array.isArray(state.hiddenItems) ? state.hiddenItems : [];
  const shownItems = isHiddenTab ? hiddenItems : visibleItems;

  const refreshLabel = state.refreshing
    ? 'Updating...'
    : (state.statusMessage || (state.lastUpdated ? `Updated ${state.lastUpdated}` : ''));

  const detailsLabel = state.refreshing
    ? 'Running fetch script...'
    : [
        state.lastSuccessAt ? `Last success: ${formatHistoryTime(state.lastSuccessAt)}` : '',
        `Total: ${state.totalWords || 0}`,
        `Changed: +${state.addedCount || 0} / -${state.removedCount || 0}`,
        `Prev → Now: ${state.previousCount || 0} → ${state.totalWords || 0}`,
      ].filter(Boolean).join(' • ');

  return (
    <div style={boxStyle}>
      <div style={titleTopStyle}>
        <div style={titleLeftStyle}>
          <div style={titleMainRowStyle}>
            <div style={titleStyle}>DuoCards • 10 items</div>
            <button
              style={refreshStyle}
              onClick={() => refreshWidget(dispatch)}
              title="Refresh now"
            >
              ↻
            </button>
            <div style={refreshMetaStyle}>{refreshLabel}</div>
          </div>
          <div style={refreshDetailsStyle}>{detailsLabel}</div>
        </div>

        <div style={statsStyle}>
          {state.remaining ? `${state.remaining} left` : ""}
          {state.hidden ? ` • ${state.hidden} hidden` : ""}
        </div>
      </div>

      <div style={tabsStyle}>
        <button
          style={tabButtonStyle(!isHiddenTab)}
          onClick={() => dispatch({ type: 'SET_TAB', tab: 'visible' })}
          title="Visible words"
        >
          Visible
        </button>
        <button
          style={tabButtonStyle(isHiddenTab)}
          onClick={() => dispatch({ type: 'SET_TAB', tab: 'hidden' })}
          title="Hidden words"
        >
          Hidden
        </button>
      </div>

      {shownItems.length === 0 ? (
        <div style={{ fontSize: "12px", color: "#cbd5e1", opacity: 0.85 }}>
          {isHiddenTab ? 'No hidden words.' : 'No visible words.'}
        </div>
      ) : (
        shownItems.map((item, index) => (
          <div key={`${item.word}-${index}`} style={index === shownItems.length - 1 ? lastItemStyle : itemStyle}>
            <div style={rowStyle}>
              <button style={speakerStyle} onClick={() => speak(item.word)} title="Speak word">🔊</button>
              <div style={wordStyle}>{item.word}</div>

              {isHiddenTab ? (
                <button
                  style={restoreStyle}
                  onClick={() => removeHiddenWord(item.word, dispatch)}
                  title="Restore word"
                >
                  ↺
                </button>
              ) : (
                <button
                  style={actionStyle}
                  onClick={() => addHiddenWord(item.word, dispatch)}
                  title="Hide word"
                >
                  ✓
                </button>
              )}
            </div>

            {item.translation ? <div style={transStyle}>{item.translation}</div> : null}

            {item.example ? (
              <div style={exampleRowStyle}>
                <button style={speakerStyle} onClick={() => speak(item.example)} title="Speak sentence">🔊</button>
                <div style={exStyle}>{item.example}</div>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
};
