"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Tab = "today" | "words" | "scenes" | "talk" | "import";
type StudyStep = "preview" | "meaning" | "sound" | "context" | "result";
type StudyWord = {
  id: number;
  korean: string;
  meaning: string;
  type: string;
  example: string;
  translation: string;
};
type MemoryRating = "again" | "hard" | "good" | "easy";
type StudyQueueItem = { word: StudyWord; repeat: boolean };
type ImportWord = {
  korean: string;
  meaning_zh: string;
  part_of_speech: string | null;
  example_ko: string | null;
  example_zh: string | null;
  tags: string[];
};

const fallbackWords: StudyWord[] = [
  { id: -1, korean: "설레다", meaning: "心动、激动", type: "动词", example: "오늘 무대가 너무 설레요.", translation: "今天的舞台让我特别心动。" },
  { id: -2, korean: "기대하다", meaning: "期待", type: "动词", example: "다음 공연도 기대해 주세요.", translation: "也请期待下一场演出。" },
  { id: -3, korean: "소중하다", meaning: "珍贵、宝贵", type: "形容词", example: "여러분은 저에게 정말 소중해요.", translation: "大家对我来说真的很珍贵。" },
];

const reviewWords = [
  { word: "무대", meaning: "舞台", level: "听音模糊", tone: "orange" },
  { word: "응원", meaning: "应援、支持", level: "今日到期", tone: "blue" },
  { word: "추억", meaning: "回忆", level: "拼写可跳过", tone: "gray" },
];

const sceneBooks = [
  { icon: "♡", title: "表达感受", count: 86, desc: "心动、感动、紧张与期待", progress: 36, color: "blue" },
  { icon: "⌁", title: "讲近况", count: 64, desc: "最近在做什么、吃了什么", progress: 18, color: "mint" },
  { icon: "✦", title: "舞台与演出", count: 112, desc: "舞台、练习、服装与现场", progress: 8, color: "lavender" },
  { icon: "☺", title: "开玩笑", count: 58, desc: "口语缩略、语气与韩网梗", progress: 0, color: "yellow" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [studyOpen, setStudyOpen] = useState(false);
  const [step, setStep] = useState<StudyStep>("preview");
  const [wordIndex, setWordIndex] = useState(0);
  const [studyQueue, setStudyQueue] = useState<StudyQueueItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dailyWords, setDailyWords] = useState(10);
  const [spelling, setSpelling] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [studyWords, setStudyWords] = useState<StudyWord[]>(fallbackWords);
  const [todayWords, setTodayWords] = useState<StudyWord[]>(fallbackWords);
  const [dataMessage, setDataMessage] = useState("登录后读取真实学习数据");
  const [isAdmin, setIsAdmin] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const current = studyQueue[wordIndex]?.word ?? studyWords[0] ?? fallbackWords[0];
  const filteredBooks = useMemo(
    () => sceneBooks.filter((book) => book.title.includes(search) || book.desc.includes(search)),
    [search],
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setStudyWords(fallbackWords);
      setTodayWords(fallbackWords);
      setDataMessage("登录后读取真实学习数据");
      setIsAdmin(false);
      return;
    }

    async function loadLearningData() {
      const [wordsResult, profileResult, progressResult] = await Promise.all([
        supabase
          .from("words")
          .select("id, korean, meaning_zh, part_of_speech, example_ko, example_zh")
          .order("id")
          .limit(100),
        supabase
          .from("profiles")
          .select("daily_new_words, spelling_enabled, is_admin")
          .eq("id", user.id)
          .single(),
        supabase
          .from("user_word_progress")
          .select("word_id, next_review_at, review_count")
          .eq("user_id", user.id),
      ]);

      if (wordsResult.error) {
        setDataMessage("数据库尚未准备好，请先运行建表脚本");
        return;
      }

      const loadedWords: StudyWord[] = (wordsResult.data ?? []).map((word) => ({
        id: word.id,
        korean: word.korean,
        meaning: word.meaning_zh,
        type: word.part_of_speech ?? "",
        example: word.example_ko ?? "",
        translation: word.example_zh ?? "",
      }));

      if (loadedWords.length > 0) {
        setStudyWords(loadedWords);
        const progress = new Map((progressResult.data ?? []).map((item) => [item.word_id, item]));
        const dueWords = loadedWords.filter((word) => {
          const record = progress.get(word.id);
          return record && new Date(record.next_review_at).getTime() <= Date.now();
        });
        const newLimit = profileResult.data?.daily_new_words ?? dailyWords;
        const newWords = loadedWords.filter((word) => !progress.has(word.id)).slice(0, newLimit);
        const plannedWords = [...dueWords, ...newWords.filter((word) => !dueWords.some((due) => due.id === word.id))];
        setTodayWords(plannedWords);
        setDataMessage(plannedWords.length > 0
          ? `今天有 ${dueWords.length} 个复习词和 ${newWords.length} 个新词`
          : "今天的任务完成了，可以去场景区看看");
      }

      if (profileResult.data) {
        setDailyWords(profileResult.data.daily_new_words);
        setSpelling(profileResult.data.spelling_enabled);
        setIsAdmin(profileResult.data.is_admin ?? false);
      }
    }

    void loadLearningData();
  }, [user, dataVersion]);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");

    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        setAuthMessage(error.message);
      } else if (!data.session) {
        setAuthMessage("注册成功，请打开邮箱里的确认链接，再回来登录。");
      } else {
        setAuthOpen(false);
        setToast("注册成功，已经登录");
        window.setTimeout(() => setToast(""), 2500);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) {
        setAuthMessage(error.message);
      } else {
        setAuthOpen(false);
        setToast("登录成功，欢迎回来");
        window.setTimeout(() => setToast(""), 2500);
      }
    }
    setAuthLoading(false);
  }

  async function handleProfileClick() {
    if (user) {
      await supabase.auth.signOut();
      setToast("已经退出登录");
      window.setTimeout(() => setToast(""), 2200);
      return;
    }
    setAuthOpen(true);
  }

  function startStudy() {
    if (!user) {
      setAuthOpen(true);
      setAuthMessage("请先登录，学习记录才能保存。");
      return;
    }
    setWordIndex(0);
    const plannedWords = todayWords.length > 0 ? todayWords : studyWords.slice(0, dailyWords);
    setStudyQueue(plannedWords.map((word) => ({ word, repeat: false })));
    setStep("preview");
    setSelected(null);
    setStudyOpen(true);
  }

  async function saveProgress(word: StudyWord, rating: MemoryRating) {
    if (!user || word.id < 0) return;
    const intervalDays = rating === "again" ? 0 : rating === "hard" ? 1 : rating === "good" ? 3 : 7;
    const nextReviewAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
    const level = rating === "again" ? 0 : rating === "hard" ? 1 : rating === "good" ? 2 : 3;
    const { data: previous } = await supabase
      .from("user_word_progress")
      .select("review_count")
      .eq("user_id", user.id)
      .eq("word_id", word.id)
      .maybeSingle();
    const { error } = await supabase.from("user_word_progress").upsert(
      {
        user_id: user.id,
        word_id: word.id,
        meaning_level: level,
        listening_level: level,
        spelling_level: spelling ? level : 0,
        review_count: (previous?.review_count ?? 0) + 1,
        next_review_at: nextReviewAt,
        last_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,word_id" },
    );
    if (error) setToast(`保存失败：${error.message}`);
  }

  async function saveSettings(nextDailyWords: number, nextSpelling: boolean) {
    setDailyWords(nextDailyWords);
    setSpelling(nextSpelling);
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        daily_new_words: nextDailyWords,
        spelling_enabled: nextSpelling,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setToast(error ? `设置保存失败：${error.message}` : "学习设置已保存");
    window.setTimeout(() => setToast(""), 1800);
  }

  function speakKorean(text: string) {
    if (!("speechSynthesis" in window)) {
      setToast("当前浏览器不支持语音朗读");
      window.setTimeout(() => setToast(""), 2400);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 0.82;
    utterance.pitch = 1;
    const koreanVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith("ko"));
    if (koreanVoice) utterance.voice = koreanVoice;
    utterance.onerror = () => {
      setToast("系统没有可用的韩语语音，请检查设备语音设置");
      window.setTimeout(() => setToast(""), 2800);
    };
    window.speechSynthesis.speak(utterance);
  }

  async function nextStudyStep() {
    setSelected(null);
    const order: StudyStep[] = spelling
      ? ["preview", "meaning", "sound", "context", "result"]
      : ["preview", "meaning", "sound", "context", "result"];
    const index = order.indexOf(step);
    setStep(order[index + 1]);
  }

  async function rateWord(rating: MemoryRating) {
    await saveProgress(current, rating);
    const shouldRepeat = rating === "again" || rating === "hard";
    const nextQueue = shouldRepeat
      ? [...studyQueue, { word: current, repeat: true }]
      : studyQueue;
    if (shouldRepeat) setStudyQueue(nextQueue);

    if (wordIndex < nextQueue.length - 1) {
      setWordIndex((value) => value + 1);
      setStep("preview");
      setSelected(null);
      return;
    }

    setStudyOpen(false);
    setDataVersion((value) => value + 1);
    setToast("本组完成。系统已经排好下一次复习");
    window.setTimeout(() => setToast(""), 2800);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActiveTab("today")} aria-label="返回今日学习">
          <span className="brand-mark">🩵</span>
          <span>Talk Guide</span>
        </button>

        <nav className="nav-list" aria-label="主导航">
          <NavButton active={activeTab === "today"} icon="⌂" label="今日学习" onClick={() => setActiveTab("today")} />
          <NavButton active={activeTab === "words"} icon="◫" label="单词本" onClick={() => setActiveTab("words")} />
          <NavButton active={activeTab === "scenes"} icon="◉" label="追星场景" onClick={() => setActiveTab("scenes")} />
          <NavButton active={activeTab === "talk"} icon="▶" label="Talk 听力" badge="BETA" onClick={() => setActiveTab("talk")} />
          {isAdmin && <NavButton active={activeTab === "import"} icon="＋" label="导入单词" onClick={() => setActiveTab("import")} />}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-button muted"><span>?</span><span>使用帮助</span></button>
          <button className="profile-button" onClick={handleProfileClick}>
            <span className="avatar">{user?.email?.slice(0, 1).toUpperCase() ?? "?"}</span>
            <span className="profile-copy">
              <strong>{user ? user.email : "登录以保存进度"}</strong>
              <small>{user ? "已登录 · 点击退出" : "注册 / 登录"}</small>
            </span>
            <span>→</span>
          </button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">🩵</span><strong>Talk Guide</strong></div>
          <label className="search-box">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索韩语单词、场景或表达"
              aria-label="搜索"
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="top-actions">
            <button className="icon-button" aria-label="连续学习">♨<span className="streak">6</span></button>
            <button className="icon-button" aria-label="通知">♢</button>
          </div>
        </header>

        {activeTab === "today" && (
          <div className="content">
            <section className="welcome-row">
              <div>
                <p className="eyebrow">JUL 27 · SUNDAY</p>
                <h1>오늘도 같이 해요 <span>↗</span></h1>
                <p>今天也一起学吧。你的复习已经为你排好了。</p>
              </div>
              <button className="settings-link" onClick={() => document.getElementById("daily-settings")?.scrollIntoView({ behavior: "smooth" })}>
                学习设置 <span>↗</span>
              </button>
            </section>

            <section className="hero-grid">
              <article className="study-card">
                <div className="card-topline">
                  <span className="pill blue-pill">今日计划</span>
                  <span className="quiet">约 18 分钟</span>
                </div>
                <div className="progress-ring" aria-label="今日进度 30%">
                  <div className="ring-inner"><strong>{Math.min(3, studyWords.length)}</strong><span>/ {dailyWords} 词</span></div>
                </div>
                <div className="study-copy">
                  <h2>先把今天的词记牢</h2>
                  <p>{dataMessage}</p>
                  <div className="mini-tags">
                    <span>识义</span><span>听音</span><span>语境</span>{spelling && <span>拼写</span>}
                  </div>
                  <button className="primary-button" onClick={startStudy}>继续学习 <span>→</span></button>
                </div>
              </article>

              <article className="review-card">
                <div className="section-heading">
                  <div><span className="pill">需要再见一面</span><h2>最近容易忘的词</h2></div>
                  <button onClick={() => setActiveTab("words")}>查看全部 ↗</button>
                </div>
                <div className="review-list">
                  {reviewWords.map((item) => (
                    <button key={item.word} className="review-row" onClick={startStudy}>
                      <span className={`status-dot ${item.tone}`} />
                      <span className="review-word"><strong>{item.word}</strong><small>{item.meaning}</small></span>
                      <span className="review-level">{item.level}</span>
                      <span className="arrow">→</span>
                    </button>
                  ))}
                </div>
              </article>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">WORDS IN REAL LIFE</p><h2>从追星场景开始</h2></div>
                <button onClick={() => setActiveTab("scenes")}>全部场景 ↗</button>
              </div>
              <div className="scene-grid">
                {(search ? filteredBooks : sceneBooks).map((book) => (
                  <button className="scene-card" key={book.title} onClick={() => setActiveTab("scenes")}>
                    <span className={`scene-icon ${book.color}`}>{book.icon}</span>
                    <span className="scene-title"><strong>{book.title}</strong><small>{book.desc}</small></span>
                    <span className="scene-count">{book.count} 词</span>
                    <span className="thin-progress"><i style={{ width: `${book.progress}%` }} /></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="bottom-grid">
              <article className="talk-preview">
                <div className="talk-visual">
                  <span className="audio-wave">▁▃▆▄▇▅▂▅▇▃▆▂▁</span>
                  <button aria-label="播放示例">▶</button>
                  <span>00:30</span>
                </div>
                <div className="talk-copy">
                  <span className="pill">附加练习 · Talk</span>
                  <h3>先听大意，再拆开每个表达</h3>
                  <p>示例课程暂不冒充真实爱豆原话。后续加入经校对的 Talk 素材。</p>
                  <button onClick={() => setActiveTab("talk")}>看看学习流程 →</button>
                </div>
              </article>

              <article className="settings-card" id="daily-settings">
                <div className="section-heading"><h3>每日设置</h3><span className="saved-label">自动保存</span></div>
                <label className="setting-row">
                  <span><strong>每日新词</strong><small>复习词会另外加入</small></span>
                  <select value={dailyWords} onChange={(event) => void saveSettings(Number(event.target.value), spelling)}>
                    <option value={5}>5 词</option><option value={10}>10 词</option><option value={15}>15 词</option><option value={20}>20 词</option>
                  </select>
                </label>
                <label className="setting-row">
                  <span><strong>拼写训练</strong><small>关闭后只练看到、听到能认出</small></span>
                  <input className="switch" type="checkbox" checked={spelling} onChange={(event) => void saveSettings(dailyWords, event.target.checked)} />
                </label>
              </article>
            </section>
          </div>
        )}

        {activeTab === "words" && <WordsPage startStudy={startStudy} words={studyWords} isAdmin={isAdmin} openImport={() => setActiveTab("import")} />}
        {activeTab === "scenes" && <ScenesPage books={search ? filteredBooks : sceneBooks} />}
        {activeTab === "talk" && <TalkPage />}
        {activeTab === "import" && (
          <ImportPage
            allowed={Boolean(user && isAdmin)}
            onImported={() => {
              setDataVersion((value) => value + 1);
              setActiveTab("words");
              setToast("单词已导入，词库已经刷新");
              window.setTimeout(() => setToast(""), 2400);
            }}
          />
        )}

        <nav className="mobile-nav" aria-label="移动端导航">
          <NavButton active={activeTab === "today"} icon="⌂" label="今日" onClick={() => setActiveTab("today")} />
          <NavButton active={activeTab === "words"} icon="◫" label="单词" onClick={() => setActiveTab("words")} />
          <NavButton active={activeTab === "scenes"} icon="◉" label="场景" onClick={() => setActiveTab("scenes")} />
          <NavButton active={activeTab === "talk"} icon="▶" label="Talk" onClick={() => setActiveTab("talk")} />
        </nav>
      </section>

      {authOpen && (
        <div className="study-overlay" role="dialog" aria-modal="true" aria-label={authMode === "login" ? "登录" : "注册"}>
          <div className="auth-modal">
            <button className="auth-close" onClick={() => setAuthOpen(false)} aria-label="关闭">×</button>
            <span className="brand-mark">🩵</span>
            <p className="eyebrow">TALK GUIDE ACCOUNT</p>
            <h2>{authMode === "login" ? "欢迎回来" : "创建学习账号"}</h2>
            <p className="auth-intro">
              {authMode === "login"
                ? "登录后，之后学习的单词和复习进度会与你的账号关联。"
                : "使用邮箱注册。Supabase 会安全处理密码，我们不会保存明文密码。"}
            </p>
            <form onSubmit={submitAuth} className="auth-form">
              <label>
                <span>邮箱</span>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="name@example.com"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="至少 6 位"
                  minLength={6}
                  required
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                />
              </label>
              {authMessage && <p className="auth-message">{authMessage}</p>}
              <button className="primary-button auth-submit" type="submit" disabled={authLoading}>
                {authLoading ? "请稍候…" : authMode === "login" ? "登录" : "注册"} <span>→</span>
              </button>
            </form>
            <button
              className="auth-switch"
              onClick={() => {
                setAuthMode(authMode === "login" ? "signup" : "login");
                setAuthMessage("");
              }}
            >
              {authMode === "login" ? "还没有账号？去注册" : "已经有账号？去登录"}
            </button>
          </div>
        </div>
      )}

      {studyOpen && (
        <div className="study-overlay" role="dialog" aria-modal="true" aria-label="单词学习">
          <div className="study-modal">
            <header className="study-header">
              <button onClick={() => setStudyOpen(false)} aria-label="关闭学习">×</button>
              <div className="study-progress"><i style={{ width: `${((wordIndex + 1) / Math.max(studyQueue.length, 1)) * 100}%` }} /></div>
              <span>{wordIndex + 1} / {studyQueue.length}</span>
            </header>
            <StudyCard step={step} word={current} selected={selected} setSelected={setSelected} onSpeak={speakKorean} />
            <footer className="study-footer">
              {step === "result" ? (
                <div className="rating-grid">
                  <button onClick={() => void rateWord("again")}><strong>不认识</strong><small>本轮再来</small></button>
                  <button onClick={() => void rateWord("hard")}><strong>有点模糊</strong><small>本轮再来</small></button>
                  <button onClick={() => void rateWord("good")}><strong>认识</strong><small>3 天后</small></button>
                  <button onClick={() => void rateWord("easy")}><strong>太简单</strong><small>7 天后</small></button>
                </div>
              ) : (
                <>
                  <span className="study-tip">{studyQueue[wordIndex]?.repeat ? "这是本轮再次出现的词" : "按自己的真实记忆作答"}</span>
                  <button className="primary-button" onClick={nextStudyStep} disabled={(step === "meaning" || step === "sound") && !selected}>继续 <span>→</span></button>
                </>
              )}
            </footer>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: string; label: string; badge?: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span><span>{label}</span>{badge && <small>{badge}</small>}</button>;
}

function StudyCard({
  step,
  word,
  selected,
  setSelected,
  onSpeak,
}: {
  step: StudyStep;
  word: StudyWord;
  selected: string | null;
  setSelected: (value: string) => void;
  onSpeak: (text: string) => void;
}) {
  if (step === "preview") return (
    <div className="learning-card center-card">
      <p className="eyebrow">FIRST LOOK · 初次见面</p>
      <button className="sound-button" aria-label="播放发音" onClick={() => onSpeak(word.korean)}>♬</button>
      <h2>{word.korean}</h2>
      <span className="word-type">{word.type}</span>
      <p className="learning-hint">先看一眼、听一遍。下一张卡会检查你是否认得。</p>
    </div>
  );
  if (step === "meaning") return (
    <div className="learning-card">
      <p className="eyebrow">MEANING · 选择词义</p>
      <h2 className="question-word">{word.korean}</h2>
      <div className="answer-grid">
        {Array.from(new Set(["期待", word.meaning, "回忆", "应援"])).map((answer) => (
          <button key={answer} className={selected === answer ? "selected" : ""} onClick={() => setSelected(answer)}>{answer}</button>
        ))}
      </div>
      {selected && <p className={`answer-note ${selected === word.meaning ? "correct" : ""}`}>{selected === word.meaning ? "认出来了。稍后还会换一种方式再见。" : `正确含义是：${word.meaning}`}</p>}
    </div>
  );
  if (step === "sound") return (
    <div className="learning-card">
      <p className="eyebrow">LISTEN · 听音识别</p>
      <button className="big-audio-button" aria-label="播放单词发音" onClick={() => onSpeak(word.korean)}>♬<small>再听一次</small></button>
      <div className="answer-grid compact">
        {Array.from(new Set([word.korean, "설레요", "소중하다", "기억하다"])).map((answer) => (
          <button key={answer} className={selected === answer ? "selected" : ""} onClick={() => setSelected(answer)}>{answer}</button>
        ))}
      </div>
    </div>
  );
  if (step === "context") return (
    <div className="learning-card">
      <p className="eyebrow">IN CONTEXT · 放进句子</p>
      <div className="context-box">
        <span>“</span><h2>{word.example}</h2><p>{word.translation}</p>
        <button className="sentence-audio" onClick={() => onSpeak(word.example)} aria-label="播放完整例句">♬ 听整句</button>
      </div>
      <div className="word-breakdown"><strong>{word.korean}</strong><span>{word.meaning}</span><small>在这句话里表达自然、真诚的情绪。</small></div>
    </div>
  );
  return (
    <div className="learning-card center-card">
      <span className="result-check">✓</span>
      <p className="eyebrow">ONE MORE TIME</p>
      <h2>{word.korean}</h2><h3>{word.meaning}</h3>
      <p className="learning-hint">这不是结束。系统会根据你的表现，在今天稍后和未来几天安排复习。</p>
      <div className="memory-options"><span>看到能认出</span><span>听到能认出</span></div>
    </div>
  );
}

function WordsPage({ startStudy, words, isAdmin, openImport }: { startStudy: () => void; words: StudyWord[]; isAdmin: boolean; openImport: () => void }) {
  return <div className="content inner-page">
    <div className="page-title"><div><p className="eyebrow">MY VOCABULARY</p><h1>我的单词本</h1><p>不是收藏夹，而是一份会主动叫你回来复习的清单。</p></div><div className="page-actions">{isAdmin && <button className="ghost-button" onClick={openImport}>导入 CSV</button>}<button className="primary-button" onClick={startStudy}>开始今日复习 →</button></div></div>
    <div className="stats-grid"><div><strong>{words.length}</strong><span>当前词库</span></div><div><strong>0</strong><span>稳定识别</span></div><div><strong>{words.length}</strong><span>等待初学</span></div><div><strong>—</strong><span>近7日记忆率</span></div></div>
    <div className="word-table">
      <div className="table-head"><span>单词</span><span>词义</span><span>掌握状态</span><span>下次复习</span></div>
      {words.map((item) => (
        <button className="table-row" key={item.id} onClick={startStudy}><strong>{item.korean}</strong><span>{item.meaning}</span><span><i className="status-dot blue" />等待初学</span><span>今天</span></button>
      ))}
    </div>
  </div>;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function ImportPage({ allowed, onImported }: { allowed: boolean; onImported: () => void }) {
  const [rows, setRows] = useState<ImportWord[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function readFile(file: File) {
    setMessage("");
    const parsed = parseCsv(await file.text());
    const headers = (parsed[0] ?? []).map((header) => header.replace(/^\uFEFF/, "").trim());
    const koreanIndex = headers.indexOf("korean");
    const meaningIndex = headers.indexOf("meaning_zh");
    if (koreanIndex < 0 || meaningIndex < 0) {
      setRows([]);
      setMessage("表头缺少 korean 或 meaning_zh，请使用页面下方的格式。");
      return;
    }
    const indexOf = (name: string) => headers.indexOf(name);
    const seen = new Set<string>();
    const imported: ImportWord[] = [];
    let skipped = 0;
    for (const values of parsed.slice(1)) {
      const korean = values[koreanIndex]?.trim() ?? "";
      const meaning = values[meaningIndex]?.trim() ?? "";
      const key = `${korean}\u0000${meaning}`;
      if (!korean || !meaning || seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      const value = (name: string) => {
        const index = indexOf(name);
        return index >= 0 ? values[index]?.trim() || null : null;
      };
      imported.push({
        korean,
        meaning_zh: meaning,
        part_of_speech: value("part_of_speech"),
        example_ko: value("example_ko"),
        example_zh: value("example_zh"),
        tags: (value("tags") ?? "").split("|").map((tag) => tag.trim()).filter(Boolean),
      });
    }
    setRows(imported);
    setMessage(`识别到 ${imported.length} 个单词${skipped ? `，跳过 ${skipped} 行空白或重复内容` : ""}。`);
  }

  async function importWords() {
    if (!allowed || rows.length === 0) return;
    setLoading(true);
    const { error } = await supabase.from("words").upsert(rows, {
      onConflict: "korean,meaning_zh",
      ignoreDuplicates: true,
    });
    setLoading(false);
    if (error) {
      setMessage(`导入失败：${error.message}`);
      return;
    }
    onImported();
  }

  if (!allowed) return <div className="content inner-page"><article className="import-card"><h1>这里需要管理员权限</h1><p>普通用户不能修改大家共用的词库。</p></article></div>;

  return <div className="content inner-page">
    <div className="page-title"><div><p className="eyebrow">ADMIN · WORD LIBRARY</p><h1>批量导入单词</h1><p>选一个 CSV 文件，确认预览无误后再写入公共词库。</p></div></div>
    <article className="import-card">
      <label className="file-drop">
        <strong>选择 CSV 文件</strong>
        <span>必填列：korean、meaning_zh；标签之间用 | 分隔。</span>
        <input type="file" accept=".csv,text/csv" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
        }} />
      </label>
      <div className="csv-example"><strong>表头示例</strong><code>korean,meaning_zh,part_of_speech,example_ko,example_zh,tags</code></div>
      {message && <p className="import-message">{message}</p>}
      {rows.length > 0 && <>
        <div className="import-preview">
          <div className="import-preview-head"><span>韩语</span><span>中文</span><span>词性</span><span>标签</span></div>
          {rows.slice(0, 8).map((word) => <div className="import-preview-row" key={`${word.korean}-${word.meaning_zh}`}><strong>{word.korean}</strong><span>{word.meaning_zh}</span><span>{word.part_of_speech || "—"}</span><span>{word.tags.join("、") || "—"}</span></div>)}
        </div>
        {rows.length > 8 && <p className="preview-note">这里只预览前 8 行，实际会导入全部 {rows.length} 行。</p>}
        <button className="primary-button import-submit" onClick={() => void importWords()} disabled={loading}>{loading ? "正在导入…" : `确认导入 ${rows.length} 个单词`}</button>
      </>}
    </article>
  </div>;
}

function ScenesPage({ books }: { books: typeof sceneBooks }) {
  return <div className="content inner-page">
    <div className="page-title"><div><p className="eyebrow">FANDOM KOREAN</p><h1>追星场景词书</h1><p>先记住真实会遇到的词，再把它们带进对话和听力。</p></div></div>
    <div className="book-grid">{books.map((book, index) => (
      <article className="book-card" key={book.title}><div className={`book-cover ${book.color}`}><span>0{index + 1}</span><strong>{book.title}</strong><small>TALK GUIDE WORD BOOK</small></div><div className="book-info"><h3>{book.title}</h3><p>{book.desc}</p><div><span>{book.count} 词</span><span>{book.progress ? `已学 ${book.progress}%` : "尚未开始"}</span></div><button>{book.progress ? "继续学习" : "加入词书"} →</button></div></article>
    ))}</div>
  </div>;
}

function TalkPage() {
  return <div className="content inner-page">
    <div className="page-title"><div><p className="eyebrow">LISTEN IN CONTEXT · BETA</p><h1>Talk 听力</h1><p>这是辅助练习区。核心仍是单词学习，Talk 帮你把学过的词放回真实语流。</p></div></div>
    <article className="empty-talk"><div className="empty-wave">▁▃▆▄▇▅▂▅▇▃▆▂▁</div><span className="pill blue-pill">准备中</span><h2>第一批真实 Talk 还没有上线</h2><p>我们不会编造“爱豆说过的话”。有来源并完成转写校对后，课程会按首听大意、字幕解析、隐藏字幕重听的流程发布。</p><div className="talk-steps"><span>01 首听大意</span><span>02 字幕解析</span><span>03 重点单词</span><span>04 隐藏字幕重听</span></div></article>
  </div>;
}
