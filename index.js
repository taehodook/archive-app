import { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import { db, isConfigured, ref, set, push, remove, onValue } from '../lib/firebase';

const DEFAULT_CATEGORIES = [
  "육아/교육",
  "요리/레시피",
  "건강/운동",
  "살림/정리",
  "재테크/소비",
  "여행/나들이",
  "개발/AI",
  "자기계발",
  "AML/업무",
  "기타"
];

function detectPlatform(url) {
  if (!url) return 'web';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/instagram\.com/i.test(url)) return 'instagram';
  return 'web';
}

function fmtDate(ts) {
  const d = new Date(ts);
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function parseKeywords(str) {
  if (!str) return [];
  return [...new Set(
    str.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
  )];
}

function extractUrlFromText(text) {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s]+/);
  return m ? m[0] : null;
}

export default function Home() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [currentCategory, setCurrentCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [sharedNotice, setSharedNotice] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const previewTimerRef = useRef(null);
  const lastPreviewUrlRef = useRef(null);
  const urlInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  // 토스트
  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 1800);
  }, []);

  // 데이터 로드: Firebase 또는 로컬
  useEffect(() => {
    if (isConfigured && db) {
      // 카테고리 동기화
      const catRef = ref(db, 'archive_categories');
      const unsubCat = onValue(catRef, snap => {
        const val = snap.val();
        if (Array.isArray(val) && val.length > 0) {
          setCategories(val);
        } else {
          set(catRef, DEFAULT_CATEGORIES);
        }
      });

      // 아이템 동기화
      const itemRef = ref(db, 'archive');
      const unsubItem = onValue(itemRef, snap => {
        const val = snap.val() || {};
        const arr = Object.entries(val).map(([id, v]) => ({ id, ...v }));
        setItems(arr);
      });

      return () => {
        unsubCat();
        unsubItem();
      };
    } else {
      // 로컬 모드
      try {
        const rawCat = localStorage.getItem('archive_categories');
        if (rawCat) setCategories(JSON.parse(rawCat));
        const rawItems = localStorage.getItem('archive_items');
        if (rawItems) setItems(JSON.parse(rawItems));
      } catch {}
    }
  }, []);

  // 첫 카테고리 기본 선택
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(category)) {
      setCategory(categories[0]);
    }
  }, [categories, category]);

  // 공유시트로 들어왔을 때 URL 자동 입력
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || extractUrlFromText(params.get('text') || '') || extractUrlFromText(params.get('title') || '');
    if (sharedUrl) {
      setUrl(sharedUrl);
      setSharedNotice(true);
      setTimeout(() => setSharedNotice(false), 4000);
      // URL 파라미터 정리
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // PWA 설치 프롬프트
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!localStorage.getItem('install_hint_dismissed')) {
        setShowInstallHint(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Service Worker 등록
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // URL 입력 변경 시 자동 보강 (debounce 500ms)
  useEffect(() => {
    const trimmed = url.trim();
    clearTimeout(previewTimerRef.current);

    if (!trimmed || !/^https?:\/\//.test(trimmed)) {
      setPreview(null);
      return;
    }

    if (lastPreviewUrlRef.current === trimmed) return;

    previewTimerRef.current = setTimeout(async () => {
      setPreviewing(true);
      setPreview(null);
      lastPreviewUrlRef.current = trimmed;
      try {
        const res = await fetch(`/api/preview?url=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (lastPreviewUrlRef.current === trimmed) {
          setPreview(data);
        }
      } catch {
        // 실패해도 저장은 가능
      } finally {
        setPreviewing(false);
      }
    }, 500);

    return () => clearTimeout(previewTimerRef.current);
  }, [url]);

  // 저장
  const saveItem = useCallback((newItem) => {
    if (isConfigured && db) {
      if (newItem.id) {
        const { id, ...data } = newItem;
        set(ref(db, 'archive/' + id), data);
      } else {
        const newRef = push(ref(db, 'archive'));
        const { id, ...data } = newItem;
        set(newRef, data);
      }
    } else {
      let updated;
      if (newItem.id) {
        updated = items.map(i => i.id === newItem.id ? newItem : i);
      } else {
        const withId = { ...newItem, id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) };
        updated = [withId, ...items];
      }
      setItems(updated);
      localStorage.setItem('archive_items', JSON.stringify(updated));
    }
  }, [items]);

  const deleteItem = useCallback((id) => {
    if (isConfigured && db) {
      remove(ref(db, 'archive/' + id));
    } else {
      const updated = items.filter(i => i.id !== id);
      setItems(updated);
      localStorage.setItem('archive_items', JSON.stringify(updated));
    }
  }, [items]);

  const saveCategories = useCallback((newCats) => {
    setCategories(newCats);
    if (isConfigured && db) {
      set(ref(db, 'archive_categories'), newCats);
    } else {
      localStorage.setItem('archive_categories', JSON.stringify(newCats));
    }
  }, []);

  const handleAdd = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      urlInputRef.current?.focus();
      toast('URL을 입력하세요');
      return;
    }

    const newItem = {
      url: trimmed,
      category: category,
      title: preview?.title || '',
      memo: '',
      keywords: parseKeywords(keywords),
      thumbnail: preview?.image || '',
      author: preview?.author || '',
      siteName: preview?.siteName || '',
      createdAt: Date.now()
    };

    saveItem(newItem);
    setUrl('');
    setKeywords('');
    setPreview(null);
    lastPreviewUrlRef.current = null;
    toast(preview?.title ? '저장됨 (자동 보강)' : '저장됨');
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') toast('설치됨');
    setInstallPrompt(null);
    setShowInstallHint(false);
  };

  const dismissInstall = () => {
    setShowInstallHint(false);
    localStorage.setItem('install_hint_dismissed', '1');
  };

  // 필터링
  const filteredItems = (() => {
    let arr = items.slice();
    if (currentCategory !== 'ALL') {
      arr = arr.filter(i => i.category === currentCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.memo || '').toLowerCase().includes(q) ||
        (i.url || '').toLowerCase().includes(q) ||
        (i.author || '').toLowerCase().includes(q) ||
        (Array.isArray(i.keywords) ? i.keywords.join(' ').toLowerCase().includes(q) : false)
      );
    }
    arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return arr;
  })();

  const counts = (() => {
    const c = { ALL: items.length };
    categories.forEach(cat => { c[cat] = 0; });
    items.forEach(i => { c[i.category] = (c[i.category] || 0) + 1; });
    return c;
  })();

  const openEdit = (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    setEditingId(id);
    setEditForm({
      title: item.title || '',
      category: categories.includes(item.category) ? item.category : (categories[0] || '기타'),
      keywords: Array.isArray(item.keywords) ? item.keywords.join(' ') : '',
      memo: item.memo || '',
      url: item.url,
      thumbnail: item.thumbnail || '',
      author: item.author || '',
      siteName: item.siteName || '',
      createdAt: item.createdAt
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const item = items.find(i => i.id === editingId);
    if (!item) return;
    saveItem({
      ...item,
      title: editForm.title.trim(),
      category: editForm.category,
      keywords: parseKeywords(editForm.keywords),
      memo: editForm.memo.trim()
    });
    setEditingId(null);
    toast('수정됨');
  };

  // 카테고리 관리 함수들
  const moveCat = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= categories.length) return;
    const arr = [...categories];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    saveCategories(arr);
  };

  const renameCat = (idx, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed) && categories[idx] !== trimmed) {
      toast('중복된 이름');
      return;
    }
    const oldName = categories[idx];
    if (oldName === trimmed) return;
    const arr = [...categories];
    arr[idx] = trimmed;
    saveCategories(arr);

    // 기존 아이템들의 카테고리도 변경
    items.forEach(it => {
      if (it.category === oldName) {
        saveItem({ ...it, category: trimmed });
      }
    });
    toast('이름 변경됨');
  };

  const deleteCat = (idx) => {
    const target = categories[idx];
    const cnt = counts[target] || 0;
    const msg = cnt > 0
      ? `"${target}"에 ${cnt}개 아이템이 있습니다. "기타"로 이동시키고 삭제할까요?`
      : `"${target}" 카테고리를 삭제할까요?`;
    if (!confirm(msg)) return;

    let newCats = [...categories];
    if (!newCats.includes('기타')) newCats.push('기타');
    newCats.splice(idx, 1);

    if (cnt > 0) {
      items.forEach(it => {
        if (it.category === target) {
          saveItem({ ...it, category: '기타' });
        }
      });
    }

    saveCategories(newCats);
    toast('삭제됨');
  };

  const addCat = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (categories.includes(name)) {
      toast('이미 존재함');
      return;
    }
    saveCategories([...categories, name]);
    setNewCatName('');
    toast('추가됨');
  };

  // 드래그앤드롭
  const draggedIdxRef = useRef(null);
  const handleDragStart = (idx) => (e) => {
    draggedIdxRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (idx) => (e) => {
    e.preventDefault();
    const from = draggedIdxRef.current;
    if (from === null || from === idx) return;
    const arr = [...categories];
    const [moved] = arr.splice(from, 1);
    arr.splice(idx, 0, moved);
    saveCategories(arr);
    draggedIdxRef.current = null;
  };

  return (
    <>
      <Head>
        <title>유용정보 아카이브</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      </Head>

      <header className="header">
        <div>
          <h1>유용정보 아카이브</h1>
          <div className="sub">SAVED · <span className="count">{items.length}</span></div>
        </div>
        <button className="settings-btn" onClick={() => setShowSettings(true)} title="설정">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </header>

      {!isConfigured && (
        <div className="config-notice">
          <strong>Firebase 미설정</strong> — 로컬 모드 작동 중. <code>lib/firebase.js</code>에 키 입력 시 동기화 활성화.
        </div>
      )}

      {showInstallHint && (
        <div className="install-hint show">
          <span>홈 화면에 설치하시겠어요?</span>
          <div>
            <button onClick={handleInstall}>설치</button>
            <button className="close" onClick={dismissInstall}>×</button>
          </div>
        </div>
      )}

      {sharedNotice && (
        <div className="share-banner">
          공유받은 URL이 자동 입력됨 → 카테고리만 선택 후 저장
        </div>
      )}

      {/* QUICK ADD */}
      <section className="quick-add">
        <div className="url-row">
          <input
            ref={urlInputRef}
            type="url"
            className="url-input"
            placeholder="https://..."
            inputMode="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
        </div>

        {previewing && (
          <div className="preview-loading">
            <span className="spinner"></span>
            <span>미리보기 가져오는 중...</span>
          </div>
        )}

        {!previewing && preview && (preview.title || preview.image) && (
          <div className="preview-card">
            {preview.image ? (
              <img src={preview.image} alt="" className="preview-thumb" onError={(e) => { e.target.style.display = 'none'; }} />
            ) : (
              <div className="preview-thumb-empty">NO IMG</div>
            )}
            <div className="preview-meta">
              <div className="preview-title">{preview.title || '제목 없음'}</div>
              <div className="preview-site">
                {preview.siteName || preview.platform?.toUpperCase()}
                {preview.author ? ` · ${preview.author}` : ''}
              </div>
            </div>
          </div>
        )}

        <input
          type="text"
          className="keyword-input"
          placeholder="키워드 (쉼표/스페이스 구분, 선택)"
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />

        <div className="add-row-2">
          <select className="category-select" value={category} onChange={e => setCategory(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn-add" onClick={handleAdd}>저장</button>
        </div>
      </section>

      {/* SEARCH */}
      <section className="search-bar">
        <input
          type="search"
          className="search-input"
          placeholder="검색 (제목·키워드·메모·URL)"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </section>

      {/* PILLS */}
      <nav className="pills">
        <button
          className={`pill ${currentCategory === 'ALL' ? 'active' : ''}`}
          onClick={() => setCurrentCategory('ALL')}
        >
          전체<span className="badge">{counts.ALL || 0}</span>
        </button>
        {categories.map(c => (
          <button
            key={c}
            className={`pill ${currentCategory === c ? 'active' : ''}`}
            onClick={() => setCurrentCategory(c)}
          >
            {c}<span className="badge">{counts[c] || 0}</span>
          </button>
        ))}
      </nav>

      {/* LIST */}
      <main className="list">
        {filteredItems.length === 0 ? (
          <div className="empty">
            <div className="ico">∅</div>
            <div className="msg">
              {items.length === 0
                ? <>URL 붙여넣고<br/>카테고리 선택 → 저장</>
                : '검색 결과 없음'}
            </div>
          </div>
        ) : (
          filteredItems.map(item => {
            const platform = detectPlatform(item.url);
            const pLabel = platform === 'youtube' ? 'YT' : platform === 'instagram' ? 'IG' : 'WEB';
            return (
              <div key={item.id} className="card" onClick={(e) => {
                if (e.target.closest('.ico-btn')) return;
                openEdit(item.id);
              }}>
                <div className="card-main">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="card-thumb"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : null}
                  <div className="card-body">
                    <div className="card-head">
                      <span className={`platform-tag ${platform}`}>{pLabel}</span>
                      <span className="category-tag">{item.category}</span>
                    </div>
                    {item.title
                      ? <div className="card-title">{item.title}</div>
                      : <div className="card-title no-title">제목 미입력</div>}
                    {item.author && <div className="card-author">{item.author}</div>}
                    <div className="card-url">{item.url}</div>
                    {Array.isArray(item.keywords) && item.keywords.length > 0 && (
                      <div className="card-keywords">
                        {item.keywords.map(k => <span key={k} className="kw-chip">#{k}</span>)}
                      </div>
                    )}
                  </div>
                </div>
                {item.memo && <div className="card-memo">{item.memo}</div>}
                <div className="card-foot">
                  <span className="card-date">{fmtDate(item.createdAt)}</span>
                  <div className="card-actions">
                    <button
                      className="ico-btn"
                      onClick={(e) => { e.stopPropagation(); window.open(item.url, '_blank'); }}
                      title="링크 열기"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                    </button>
                    <button
                      className="ico-btn"
                      onClick={(e) => { e.stopPropagation(); openEdit(item.id); }}
                      title="편집"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button
                      className="ico-btn danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('삭제할까요?')) {
                          deleteItem(item.id);
                          toast('삭제됨');
                        }
                      }}
                      title="삭제"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* EDIT MODAL */}
      {editingId && (
        <div className="modal-bg show" onClick={(e) => { if (e.currentTarget === e.target) setEditingId(null); }}>
          <div className="modal">
            <div className="modal-title">상세 편집</div>
            <div className="field">
              <label>URL</label>
              <div className="url-display">{editForm.url}</div>
            </div>
            <div className="field">
              <label>제목</label>
              <input
                type="text"
                value={editForm.title}
                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="나중에 알아볼 한 줄"
              />
            </div>
            <div className="field">
              <label>카테고리</label>
              <select
                value={editForm.category}
                onChange={e => setEditForm({ ...editForm, category: e.target.value })}
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>키워드</label>
              <input
                type="text"
                value={editForm.keywords}
                onChange={e => setEditForm({ ...editForm, keywords: e.target.value })}
                placeholder="쉼표 또는 스페이스로 구분"
              />
              <div className="field-hint">예: 절약 카드혜택 신한</div>
            </div>
            <div className="field">
              <label>메모</label>
              <textarea
                value={editForm.memo}
                onChange={e => setEditForm({ ...editForm, memo: e.target.value })}
                placeholder="실전 적용 포인트, 핵심 내용..."
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditingId(null)}>취소</button>
              <button className="btn-primary" onClick={saveEdit}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="modal-bg show" onClick={(e) => { if (e.currentTarget === e.target) setShowSettings(false); }}>
          <div className="modal">
            <div className="modal-title">카테고리 관리</div>

            <div className="cat-add-row">
              <input
                type="text"
                placeholder="새 카테고리 이름"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCat(); }}
                maxLength={20}
              />
              <button onClick={addCat}>추가</button>
            </div>

            <div className="cat-list">
              {categories.map((c, idx) => (
                <div
                  key={c}
                  className="cat-row"
                  draggable
                  onDragStart={handleDragStart(idx)}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop(idx)}
                >
                  <span className="cat-handle">⋮⋮</span>
                  <input
                    type="text"
                    className="cat-name"
                    defaultValue={c}
                    onBlur={(e) => renameCat(idx, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                    maxLength={20}
                  />
                  <span className="cat-count">{counts[c] || 0}</span>
                  <button className="cat-up" disabled={idx === 0} onClick={() => moveCat(idx, -1)}>↑</button>
                  <button className="cat-down" disabled={idx === categories.length - 1} onClick={() => moveCat(idx, 1)}>↓</button>
                  <button className="cat-del" onClick={() => deleteCat(idx)}>×</button>
                </div>
              ))}
            </div>

            <div className="field-hint" style={{ marginBottom: 12 }}>
              ↑↓ 버튼 또는 드래그로 순서 변경 · 이름 클릭하여 수정<br />
              카테고리 삭제 시 해당 카테고리의 아이템은 "기타"로 이동
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setShowSettings(false)}>완료</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast show">{toastMsg}</div>}
    </>
  );
}
