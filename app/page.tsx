"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Tab = "today" | "words" | "scenes" | "talk" | "import" | "preferences";
type StudyStep = "preview" | "meaning" | "sound" | "context" | "result";
type StudyWord = {
  id: number;
  korean: string;
  meaning: string;
  type: string;
  example: string;
  translation: string;
  tags: string[];
};
type MemoryRating = "again" | "hard" | "good" | "easy";
type StudyQueueItem = { word: StudyWord; repeat: boolean };
type WordProgress = {
  word_id: number;
  meaning_level: number;
  listening_level: number;
  review_count: number;
  next_review_at: string;
  last_reviewed_at: string | null;
};
type ImportWord = {
  korean: string;
  meaning_zh: string;
  part_of_speech: string | null;
  example_ko: string | null;
  example_zh: string | null;
  tags: string[];
};

const fallbackWords: StudyWord[] = [
  { id: -1, korean: "설레다", meaning: "心动、激动", type: "动词", example: "오늘 무대가 너무 설레요.", translation: "今天的舞台让我特别心动。", tags: ["追星", "感受"] },
  { id: -2, korean: "기대하다", meaning: "期待", type: "动词", example: "다음 공연도 기대해 주세요.", translation: "也请期待下一场演出。", tags: ["追星", "演唱会"] },
  { id: -3, korean: "소중하다", meaning: "珍贵、宝贵", type: "形容词", example: "여러분은 저에게 정말 소중해요.", translation: "大家对我来说真的很珍贵。", tags: ["追星", "粉丝"] },
];

const sceneBooks = [
  { icon: "◎", title: "线下活动", desc: "预录、签售、演唱会与应援", color: "blue", tags: ["线下活动", "演唱会", "应援", "签售", "购票", "打歌"] },
  { icon: "♡", title: "互动交流", desc: "夸赞、提问、感谢与关心", color: "mint", tags: ["互动", "感受", "粉丝", "问候"] },
  { icon: "✦", title: "舞台与造型", desc: "舞台、音乐、服装和妆发", color: "lavender", tags: ["造型", "舞台", "音乐"] },
  { icon: "⌁", title: "泡泡与数字生活", desc: "泡泡、社媒、直播和短视频", color: "yellow", tags: ["数字生活", "泡泡", "社交媒体"] },
  { icon: "☻", title: "饭圈用语", desc: "缩写、物料、梗与粉丝交流", color: "blue", tags: ["饭圈", "口语", "周边"] },
] as const;

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
  const [wordProgress, setWordProgress] = useState<Record<number, WordProgress>>({});
  const [dataMessage, setDataMessage] = useState("登录后读取真实学习数据");
  const [isAdmin, setIsAdmin] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [koreanVoices, setKoreanVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [activeSceneTitle, setActiveSceneTitle] = useState<(typeof sceneBooks)[number]["title"]>(sceneBooks[0].title);
  const [streakDays, setStreakDays] = useState(0);

  const current = studyQueue[wordIndex]?.word ?? studyWords[0] ?? fallbackWords[0];
  const sceneCards = useMemo(() => sceneBooks.map((book) => {
    const words = studyWords.filter((word) => word.tags.some((tag) => (book.tags as readonly string[]).includes(tag)));
    const learned = words.filter((word) => {
      const progress = wordProgress[word.id];
      return progress && Math.min(progress.meaning_level, progress.listening_level) >= 2;
    }).length;
    return { ...book, count: words.length, progress: words.length ? Math.round((learned / words.length) * 100) : 0 };
  }), [studyWords, wordProgress]);
  const filteredBooks = useMemo(
    () => sceneCards.filter((book) => book.title.includes(search) || book.desc.includes(search)),
    [search, sceneCards],
  );
  const reviewItems = useMemo(() => studyWords
    .map((word) => ({ word, record: wordProgress[word.id] }))
    .filter(({ record }) => record && Math.min(record.meaning_level, record.listening_level) < 2)
    .sort((a, b) => new Date(a.record!.next_review_at).getTime() - new Date(b.record!.next_review_at).getTime())
    .slice(0, 3), [studyWords, wordProgress]);
  const todayCompleted = Boolean(user && studyWords.length > 0 && todayWords.length === 0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadKoreanVoices = () => {
      const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("ko"));
      setKoreanVoices(voices);
      const savedVoiceURI = window.localStorage.getItem("talk-guide-korean-voice") ?? "";
      const preferredVoice = voices.find((voice) => /yuna|heami|sunhi|female|natural/i.test(voice.name)) ?? voices[0];
      setSelectedVoiceURI((current) => current || (voices.some((voice) => voice.voiceURI === savedVoiceURI) ? savedVoiceURI : preferredVoice?.voiceURI ?? ""));
    };
    loadKoreanVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadKoreanVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadKoreanVoices);
  }, []);

  useEffect(() => {
    if (!user) {
      setStudyWords(fallbackWords);
      setTodayWords(fallbackWords);
      setWordProgress({});
      setStreakDays(0);
      setDataMessage("登录后读取真实学习数据");
      setIsAdmin(false);
      return;
    }

    async function loadLearningData() {
      const [wordsResult, profileResult, progressResult] = await Promise.all([
        supabase
          .from("words")
          .select("id, korean, meaning_zh, part_of_speech, example_ko, example_zh, tags")
          .order("id")
          .limit(1000),
        supabase
          .from("profiles")
          .select("daily_new_words, spelling_enabled, is_admin")
          .eq("id", user.id)
          .single(),
        supabase
          .from("user_word_progress")
          .select("word_id, meaning_level, listening_level, next_review_at, review_count, last_reviewed_at")
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
          tags: word.tags ?? [],
      }));

      if (loadedWords.length > 0) {
        setStudyWords(loadedWords);
        const progressRows = (progressResult.data ?? []) as WordProgress[];
        const progress = new Map(progressRows.map((item) => [item.word_id, item]));
        setWordProgress(Object.fromEntries(progressRows.map((item) => [item.word_id, item])));
        setStreakDays(calculateStudyStreak(progressRows));
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

  function startStudy(words?: StudyWord[]) {
    if (!user) {
      setAuthOpen(true);
      setAuthMessage("请先登录，学习记录才能保存。");
      return;
    }
    const plannedWords = words ?? todayWords;
    if (plannedWords.length === 0 && studyWords.length === 0) {
      setToast("词库里还没有单词，先去导入一批吧");
      window.setTimeout(() => setToast(""), 2400);
      return;
    }
    if (!words && todayWords.length === 0) {
      setToast("今天的学习已经完成，明天再来复习吧");
      window.setTimeout(() => setToast(""), 2400);
      return;
    }
    setWordIndex(0);
    setStudyQueue(shuffleWords(plannedWords.slice(0, dailyWords)).map((word) => ({ word, repeat: false })));
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
    utterance.rate = 0.94;
    utterance.pitch = 1;
    const koreanVoice = koreanVoices.find((voice) => voice.voiceURI === selectedVoiceURI)
      ?? koreanVoices.find((voice) => /yuna|heami|sunhi|female|natural/i.test(voice.name))
      ?? window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ko"));
    if (koreanVoice) utterance.voice = koreanVoice;
    utterance.onerror = () => {
      setToast("系统没有可用的韩语语音，请检查设备语音设置");
      window.setTimeout(() => setToast(""), 2800);
    };
    window.speechSynthesis.speak(utterance);
  }

  function changeKoreanVoice(voiceURI: string) {
    setSelectedVoiceURI(voiceURI);
    window.localStorage.setItem("talk-guide-korean-voice", voiceURI);
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
            <button className="icon-button" aria-label={`连续学习 ${streakDays} 天`} onClick={() => setActiveTab("today")}>♨<span className="streak">{streakDays}</span></button>
            <button className="icon-button" aria-label="打开个人偏好" onClick={() => setActiveTab("preferences")}>♢</button>
          </div>
        </header>

        {activeTab === "today" && (
          <div className="content">
            <section className="welcome-row">
              <div>
                <p className="eyebrow">TODAY · DAILY PLAN</p>
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
                <div className="progress-ring" aria-label={todayCompleted ? "今日任务已完成" : `今日还有 ${todayWords.length} 个词`}>
                  <div className="ring-inner"><strong>{todayCompleted ? "✓" : todayWords.length}</strong><span>{todayCompleted ? "今日完成" : "待学"}</span></div>
                </div>
                <div className="study-copy">
                  <h2>{todayCompleted ? "今天已经学完啦" : "先把今天的词记牢"}</h2>
                  <p>{dataMessage}</p>
                  <div className="mini-tags">
                    <span>识义</span><span>听音</span><span>语境</span>{spelling && <span>拼写</span>}
                  </div>
                  <button className="primary-button" onClick={todayCompleted ? () => setActiveTab("scenes") : startStudy}>{todayCompleted ? "去看看追星场景" : "继续学习"} <span>→</span></button>
                </div>
              </article>

              <article className="review-card">
                <div className="section-heading">
                  <div><span className="pill">需要再见一面</span><h2>最近容易忘的词</h2></div>
                  <button onClick={() => setActiveTab("words")}>查看全部 ↗</button>
                </div>
                <div className="review-list">
                  {reviewItems.length > 0 ? reviewItems.map(({ word, record }) => {
                    const status = progressLabel(record);
                    return <button key={word.id} className="review-row" onClick={startStudy}>
                      <span className={`status-dot ${status.tone}`} />
                      <span className="review-word"><strong>{word.korean}</strong><small>{word.meaning}</small></span>
                      <span className="review-level">{status.label}</span>
                      <span className="arrow">→</span>
                    </button>;
                  }) : <p className="empty-review">{user ? "暂时没有需要重点复习的词。" : "登录后会显示你的真实复习提醒。"}</p>}
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
                  <button className="scene-card" key={book.title} onClick={() => { setActiveSceneTitle(book.title); setActiveTab("scenes"); }}>
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
                <div className="section-heading"><h3>个人偏好</h3><span className="saved-label">自动保存</span></div>
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
                <div className="setting-row">
                  <span><strong>韩语发音</strong><small>{koreanVoices.length > 1 ? "从这台设备可用的韩语语音中选择" : "由这台设备的系统语音提供"}</small></span>
                  <div className="voice-control">
                    <select value={selectedVoiceURI} onChange={(event) => changeKoreanVoice(event.target.value)} disabled={koreanVoices.length === 0} aria-label="选择韩语发音">
                      {koreanVoices.length > 0 ? koreanVoices.map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name}</option>) : <option>未发现韩语语音</option>}
                    </select>
                    <button className="voice-test" onClick={() => speakKorean("안녕하세요. 오늘도 같이 한국어를 공부해요.")} disabled={koreanVoices.length === 0}>试听</button>
                  </div>
                </div>
              </article>
            </section>
          </div>
        )}

        {activeTab === "words" && <WordsPage startStudy={startStudy} words={studyWords} progress={wordProgress} isAdmin={isAdmin} openImport={() => setActiveTab("import")} />}
        {activeTab === "scenes" && <ScenesPage books={search ? filteredBooks : sceneCards} words={studyWords} progress={wordProgress} dailyWords={dailyWords} activeSceneTitle={activeSceneTitle} setActiveSceneTitle={setActiveSceneTitle} startStudy={startStudy} />}
        {activeTab === "talk" && <TalkPage />}
        {activeTab === "preferences" && <PreferencesPage dailyWords={dailyWords} spelling={spelling} saveSettings={saveSettings} koreanVoices={koreanVoices} selectedVoiceURI={selectedVoiceURI} changeKoreanVoice={changeKoreanVoice} onSpeak={speakKorean} />}
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
        {word.example ? <><span>“</span><h2>{word.example}</h2><p>{word.translation}</p>
          <button className="sentence-audio" onClick={() => onSpeak(word.example)} aria-label="播放完整例句">♬ 听整句</button></> : <p className="learning-hint">这张基础词卡暂时没有例句。先练到看到和听到都能认出它。</p>}
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

function shuffleWords(words: StudyWord[]) {
  const shuffled = [...words];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function calculateStudyStreak(records: WordProgress[]) {
  const dates = new Set(records.map((record) => record.last_reviewed_at?.slice(0, 10)).filter(Boolean));
  if (dates.size === 0) return 0;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  if (!dates.has(todayKey) && !dates.has(yesterdayKey)) return 0;
  const cursor = new Date(dates.has(todayKey) ? today : yesterday);
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function progressLabel(record?: WordProgress) {
  if (!record) return { label: "等待初学", tone: "gray" };
  const level = Math.min(record.meaning_level, record.listening_level);
  if (level === 0) return { label: "需要重学", tone: "orange" };
  if (level === 1) return { label: "有点模糊", tone: "orange" };
  if (level === 2) return { label: "已经认识", tone: "blue" };
  return { label: "稳定识别", tone: "green" };
}

function reviewDate(value?: string) {
  if (!value) return "首次学习";
  const date = new Date(value);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startDate - startToday) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "今天";
  if (days === 1) return "明天";
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function PreferencesPage({ dailyWords, spelling, saveSettings, koreanVoices, selectedVoiceURI, changeKoreanVoice, onSpeak }: { dailyWords: number; spelling: boolean; saveSettings: (dailyWords: number, spelling: boolean) => Promise<void>; koreanVoices: SpeechSynthesisVoice[]; selectedVoiceURI: string; changeKoreanVoice: (voiceURI: string) => void; onSpeak: (text: string) => void }) {
  return <div className="content inner-page">
    <div className="page-title"><div><p className="eyebrow">YOUR LEARNING SPACE</p><h1>个人偏好</h1><p>调整每天学多少、要不要练拼写，以及你想听到的韩语发音。</p></div></div>
    <article className="preferences-card settings-card">
      <div className="section-heading"><h3>学习方式</h3><span className="saved-label">自动保存</span></div>
      <label className="setting-row">
        <span><strong>每日新词</strong><small>复习词会另外加入</small></span>
        <select value={dailyWords} onChange={(event) => void saveSettings(Number(event.target.value), spelling)}><option value={5}>5 词</option><option value={10}>10 词</option><option value={15}>15 词</option><option value={20}>20 词</option></select>
      </label>
      <label className="setting-row">
        <span><strong>拼写训练</strong><small>关闭后只练看到、听到能认出</small></span>
        <input className="switch" type="checkbox" checked={spelling} onChange={(event) => void saveSettings(dailyWords, event.target.checked)} />
      </label>
      <div className="setting-row">
        <span><strong>韩语发音</strong><small>{koreanVoices.length > 1 ? "从这台设备可用的韩语语音中选择" : "由这台设备的系统语音提供"}</small></span>
        <div className="voice-control">
          <select value={selectedVoiceURI} onChange={(event) => changeKoreanVoice(event.target.value)} disabled={koreanVoices.length === 0} aria-label="选择韩语发音">{koreanVoices.length > 0 ? koreanVoices.map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name}</option>) : <option>未发现韩语语音</option>}</select>
          <button className="voice-test" onClick={() => onSpeak("안녕하세요. 오늘도 같이 한국어를 공부해요.")} disabled={koreanVoices.length === 0}>试听</button>
        </div>
      </div>
    </article>
  </div>;
}

function WordsPage({ startStudy, words, progress, isAdmin, openImport }: { startStudy: () => void; words: StudyWord[]; progress: Record<number, WordProgress>; isAdmin: boolean; openImport: () => void }) {
  const records = Object.values(progress);
  const stableCount = records.filter((record) => Math.min(record.meaning_level, record.listening_level) >= 3).length;
  const dueCount = records.filter((record) => new Date(record.next_review_at).getTime() <= Date.now()).length;
  const newCount = words.filter((word) => !progress[word.id]).length;
  return <div className="content inner-page">
    <div className="page-title"><div><p className="eyebrow">MY VOCABULARY</p><h1>我的单词本</h1><p>不是收藏夹，而是一份会主动叫你回来复习的清单。</p></div><div className="page-actions">{isAdmin && <button className="ghost-button" onClick={openImport}>导入 CSV</button>}<button className="primary-button" onClick={startStudy}>开始今日复习 →</button></div></div>
    <div className="stats-grid"><div><strong>{words.length}</strong><span>当前词库</span></div><div><strong>{stableCount}</strong><span>稳定识别</span></div><div><strong>{newCount}</strong><span>等待初学</span></div><div><strong>{dueCount}</strong><span>今日到期</span></div></div>
    <div className="word-table">
      <div className="table-head"><span>单词</span><span>词义</span><span>掌握状态</span><span>下次复习</span></div>
      {words.map((item) => {
        const record = progress[item.id];
        const status = progressLabel(record);
        return <button className="table-row" key={item.id} onClick={startStudy}><strong>{item.korean}</strong><span>{item.meaning}</span><span><i className={`status-dot ${status.tone}`} />{status.label}</span><span>{reviewDate(record?.next_review_at)}</span></button>;
      })}
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
      ignoreDuplicates: false,
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
        <span>必填列：korean、meaning_zh；同一词条再次导入会更新例句和标签。</span>
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

type SceneCard = (typeof sceneBooks)[number] & { count: number; progress: number };

function ScenesPage({ books, words, progress, dailyWords, activeSceneTitle, setActiveSceneTitle, startStudy }: { books: SceneCard[]; words: StudyWord[]; progress: Record<number, WordProgress>; dailyWords: number; activeSceneTitle: string; setActiveSceneTitle: (title: (typeof sceneBooks)[number]["title"]) => void; startStudy: (words?: StudyWord[]) => void }) {
  const activeScene = books.find((book) => book.title === activeSceneTitle) ?? books[0];
  const sceneWords = activeScene ? words.filter((word) => word.tags.some((tag) => (activeScene.tags as readonly string[]).includes(tag))) : [];
  const readyWords = sceneWords.filter((word) => !progress[word.id] || Math.min(progress[word.id].meaning_level, progress[word.id].listening_level) < 2);
  return <div className="content inner-page">
    <div className="page-title"><div><p className="eyebrow">FANDOM KOREAN · REAL SITUATIONS</p><h1>追星场景词书</h1><p>先选你最近会遇到的场景，再把需要说出口的词练熟。</p></div></div>
    <div className="scene-tabs" role="tablist" aria-label="选择追星场景">{books.map((book) => <button key={book.title} role="tab" aria-selected={book.title === activeScene?.title} className={book.title === activeScene?.title ? "active" : ""} onClick={() => setActiveSceneTitle(book.title)}>{book.icon} {book.title}<small>{book.count}</small></button>)}</div>
    {activeScene && <section className="scene-detail">
      <div className={`scene-detail-cover ${activeScene.color}`}><span>{activeScene.icon}</span><div><p className="eyebrow">SCENE WORD BOOK</p><h2>{activeScene.title}</h2><p>{activeScene.desc}</p></div><strong>{activeScene.count}<small>词</small></strong></div>
      <div className="scene-detail-body"><div><h3>这一组先学什么</h3><p>{readyWords.length > 0 ? `这里有 ${readyWords.length} 个还不稳定的词。每次从中选 ${Math.min(dailyWords, readyWords.length)} 个练习。` : "这组词已经练得很稳了，可以换一个场景。"}</p><div className="scene-word-chips">{sceneWords.slice(0, 12).map((word) => <span key={word.id}><strong>{word.korean}</strong>{word.meaning}</span>)}</div></div><button className="primary-button" onClick={() => startStudy(readyWords.length > 0 ? readyWords : sceneWords)} disabled={sceneWords.length === 0}>{readyWords.length > 0 ? "开始本场景练习" : "复习本场景"} <span>→</span></button></div>
    </section>}
  </div>;
}

function TalkPage() {
  return <div className="content inner-page">
    <div className="page-title"><div><p className="eyebrow">LISTEN IN CONTEXT · BETA</p><h1>Talk 听力</h1><p>这是辅助练习区。核心仍是单词学习，Talk 帮你把学过的词放回真实语流。</p></div></div>
    <article className="empty-talk"><div className="empty-wave">▁▃▆▄▇▅▂▅▇▃▆▂▁</div><span className="pill blue-pill">准备中</span><h2>第一批真实 Talk 还没有上线</h2><p>我们不会编造“爱豆说过的话”。有来源并完成转写校对后，课程会按首听大意、字幕解析、隐藏字幕重听的流程发布。</p><div className="talk-steps"><span>01 首听大意</span><span>02 字幕解析</span><span>03 重点单词</span><span>04 隐藏字幕重听</span></div></article>
  </div>;
}
