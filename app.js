(() => {
  "use strict";
  const STORAGE_KEY = "ritm.tasks.v1";
  const $ = (id) => document.getElementById(id);
  const today = new Date();
  today.setHours(0,0,0,0);
  let tasks = loadTasks();
  let activeView = "overview";
  let toastTimer;

  function localDateString(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function parseDate(value) {
    if (!value) return null;
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setHours(0,0,0,0);
    return d;
  }
  function dayDiff(value) {
    const d = parseDate(value);
    if (!d) return 9999;
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }
  function loadTasks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(t => t && t.id && t.title && t.due) : [];
    } catch (e) { return []; }
  }
  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      return true;
    } catch (e) {
      showToast("Не удалось сохранить данные в браузере.", true);
      return false;
    }
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function isDone(task) { return task.status === "done"; }
  function riskLevel(task) {
    if (isDone(task)) return { level: "done", score: 0, label: "Выполнено" };
    const days = dayDiff(task.due);
    const hours = Number(task.hours) || 1;
    const priority = task.priority === "high" ? 18 : task.priority === "low" ? -8 : 0;
    let score = 8 + priority + Math.max(0, hours - 1) * 5;
    if (days < 0) score += 75 + Math.min(20, Math.abs(days) * 3);
    else if (days === 0) score += 65;
    else if (days === 1) score += 45;
    else if (days <= 3) score += 25;
    else if (days <= 7) score += 10;
    if (days > 7) score -= 10;
    score = Math.max(0, Math.min(100, score));
    if (days < 0 || score >= 70) return { level: "high", score, label: days < 0 ? "Просрочено" : "Высокий риск" };
    if (score >= 42) return { level: "medium", score, label: "Нужно внимание" };
    return { level: "low", score, label: "В графике" };
  }
  function urgency(task) {
    const risk = riskLevel(task);
    const days = dayDiff(task.due);
    const priorityBonus = task.priority === "high" ? 18 : task.priority === "low" ? -8 : 0;
    const deadlineScore = days < 0 ? 110 + Math.abs(days) : days === 0 ? 100 : days === 1 ? 82 : days <= 3 ? 60 - days * 3 : days <= 7 ? 30 - days : 8;
    const effortScore = Math.min(20, (Number(task.hours) || 1) * 2);
    return deadlineScore + effortScore + priorityBonus + risk.score * 0.2;
  }
  function fmtDate(value) {
    const d = parseDate(value);
    if (!d) return "Без даты";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(d).replace(".", "");
  }
  function dueText(task) {
    const days = dayDiff(task.due);
    if (days < 0) return `Просрочено на ${Math.abs(days)} дн.`;
    if (days === 0) return "Сегодня";
    if (days === 1) return "Завтра";
    if (days <= 7) return `Через ${days} дн.`;
    return fmtDate(task.due);
  }
  function dueClass(task) {
    const days = dayDiff(task.due);
    return days <= 1 ? "urgent" : days <= 3 ? "soon" : "";
  }
  function hoursText(hours) {
    const h = Number(hours) || 1;
    if (h < 1) return "30 минут";
    if (h === 1) return "1 час";
    if (h < 5) return `${h} ч.`;
    return `${h}+ ч.`;
  }
  function sortedActive() {
    return tasks.filter(t => !isDone(t)).sort((a,b) => urgency(b) - urgency(a));
  }
  function nextTask() { return sortedActive()[0] || null; }
  function showToast(message, isError=false) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }
  function taskRow(task, withActions=false) {
    const risk = riskLevel(task);
    const done = isDone(task);
    const subject = task.subject ? escapeHtml(task.subject) : "Без предмета";
    const hours = hoursText(task.hours);
    const dueClassName = dueClass(task);
    return `<div class="task-row" data-task-row="${escapeHtml(task.id)}">
      <button class="task-check ${done ? "checked" : ""}" data-action="toggle" data-id="${escapeHtml(task.id)}" aria-label="${done ? "Вернуть в активные" : "Отметить выполненным"}">${done ? "✓" : ""}</button>
      <div class="task-main"><div class="task-title ${done ? "is-done" : ""}">${escapeHtml(task.title)}</div>
        <div class="task-meta"><span>${subject}</span><span class="meta-dot"></span><span>${hours}</span></div></div>
      <div class="task-trailing"><span class="due-label ${done ? "" : dueClassName}">${done ? "Готово" : dueText(task)}</span>
        ${!done && risk.level !== "low" ? `<span class="risk-pill ${risk.level === "medium" ? "medium" : ""}">${risk.level === "high" ? "Риск" : "Внимание"}</span>` : ""}
        ${withActions ? `<div class="task-actions"><button class="small-action" data-action="edit" data-id="${escapeHtml(task.id)}">Изменить</button><button class="small-action delete" data-action="delete" data-id="${escapeHtml(task.id)}">Удалить</button></div>` : ""}
      </div></div>`;
  }
  function emptyState(title, copy, buttonText="Добавить задание") {
    return `<div class="empty-state"><div class="empty-icon">✳</div><strong>${title}</strong><p>${copy}</p>${buttonText ? `<button class="button button-secondary" data-action="add">${buttonText}</button>` : ""}</div>`;
  }
  function renderOverview() {
    const active = tasks.filter(t => !isDone(t));
    const done = tasks.filter(isDone).length;
    const week = active.filter(t => dayDiff(t.due) >= 0 && dayDiff(t.due) <= 7).length;
    const risks = active.filter(t => riskLevel(t).level === "high").length;
    const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    $("metric-active").textContent = active.length;
    $("metric-active-foot").textContent = active.length ? `Осталось оценочно ${active.reduce((s,t)=>s+(Number(t.hours)||1),0)} ч. работы` : "Пока всё чисто";
    $("metric-week").textContent = week;
    $("metric-risk").textContent = risks;
    $("metric-risk-foot").textContent = risks ? "Лучше разобраться с ними сегодня" : "Критичных сроков нет";
    $("metric-done").innerHTML = `${percent}<span class="metric-small">%</span>`;
    $("completion-bar").style.width = `${percent}%`;
    $("nav-task-count").textContent = active.length;

    const upcoming = active.slice().sort((a,b) => {
      const da = dayDiff(a.due), db = dayDiff(b.due);
      return da - db || urgency(b) - urgency(a);
    }).slice(0, 4);
    $("upcoming-list").innerHTML = upcoming.length ? upcoming.map(t => taskRow(t)).join("") :
      emptyState("Список пока пуст", "Добавь первое задание — и Ритм поможет понять, с чего начать.");
    const next = nextTask();
    if (!next) {
      $("recommendation").innerHTML = `<div class="rec-kicker">ХОРОШИЙ МОМЕНТ</div><div class="rec-title">Похоже, срочных дел нет.</div><div class="rec-reason">Добавь ближайший дедлайн или выдохни — ты заслужил паузу.</div>`;
    } else {
      const risk = riskLevel(next);
      $("recommendation").innerHTML = `<div class="rec-kicker">${risk.level === "high" ? "СНАЧАЛА ЭТО" : "ПРЕДЛАГАЕМЫЙ СЛЕДУЮЩИЙ ШАГ"}</div>
        <div class="rec-title">${escapeHtml(next.title)}</div>
        <div class="rec-subject">${escapeHtml(next.subject || "Без предмета")} · ${hoursText(next.hours)} · ${dueText(next)}</div>
        <div class="rec-reason">${recommendationReason(next)}</div>
        ${next.step ? `<div class="rec-step">↳ Первый шаг: ${escapeHtml(next.step)}</div>` : ""}`;
    }
    renderChart();
  }
  function recommendationReason(task) {
    const days = dayDiff(task.due);
    if (days < 0) return "Срок уже прошёл. Проверь, можно ли сдать работу позже, и выдели ближайший конкретный шаг.";
    if (days === 0) return "Дедлайн сегодня. Сначала сделай минимально достаточную версию работы.";
    if (days === 1) return "До срока остался день. Лучше начать сейчас, чтобы оставить время на проверку.";
    if (task.priority === "high") return "Ты отметил это как важное. Выдели небольшой блок времени и продвинься хотя бы на один шаг.";
    if (Number(task.hours) >= 4) return "Задание объёмное. Раздели работу на части и начни с самой понятной.";
    return "Сделай первый небольшой шаг сейчас — так будет проще вернуться к задаче позже.";
  }
  function renderChart() {
    const active = tasks.filter(t => !isDone(t));
    const days = Array.from({length:7}, (_,i) => {
      const d = new Date(today); d.setDate(d.getDate()+i);
      return {date:localDateString(d), label:i===0 ? "Сегодня" : new Intl.DateTimeFormat("ru-RU",{weekday:"short"}).format(d).replace(".",""), hours:0};
    });
    active.forEach(t => {
      const idx = days.findIndex(d => d.date === t.due);
      if (idx >= 0) days[idx].hours += Number(t.hours) || 1;
    });
    const max = Math.max(2, ...days.map(d => d.hours));
    $("load-chart").innerHTML = days.map((d,i) => `<div class="chart-day"><div class="chart-value">${d.hours ? `${d.hours} ч.` : "—"}</div><div class="bar-track"><div class="bar ${i===0 ? "today" : ""}" style="height:${Math.max(d.hours ? 8 : 3, d.hours/max*100)}%"></div></div><div class="chart-label ${i===0 ? "today" : ""}">${escapeHtml(d.label)}</div></div>`).join("");
  }
  function renderTasks() {
    const q = $("task-search").value.trim().toLocaleLowerCase("ru");
    const filter = $("task-filter").value;
    let list = tasks.filter(t => {
      const text = `${t.title} ${t.subject || ""} ${t.step || ""}`.toLocaleLowerCase("ru");
      if (q && !text.includes(q)) return false;
      if (filter === "active" && isDone(t)) return false;
      if (filter === "done" && !isDone(t)) return false;
      if (filter === "risk" && (isDone(t) || riskLevel(t).level !== "high")) return false;
      return true;
    }).sort((a,b) => isDone(a)-isDone(b) || dayDiff(a.due)-dayDiff(b.due) || urgency(b)-urgency(a));
    $("task-list-subtitle").textContent = `${list.length} ${plural(list.length, "задание", "задания", "заданий")} в списке`;
    $("all-task-list").innerHTML = list.length ? list.map(t => taskRow(t,true)).join("") :
      emptyState(q || filter !== "all" ? "Ничего не найдено" : "Здесь появятся задания", q || filter !== "all" ? "Попробуй изменить поиск или фильтр." : "Добавь первое задание, чтобы собрать свою учебную нагрузку.", q || filter !== "all" ? "" : "Добавить задание");
  }
  function plural(n, one, few, many) {
    const n10=n%10,n100=n%100;
    if(n10===1 && n100!==11)return one;
    if(n10>=2 && n10<=4 && (n100<12||n100>14))return few;
    return many;
  }
  function renderFocus() {
    const task = nextTask();
    if (!task) {
      $("focus-task-area").innerHTML = `<div class="panel focus-task-card">${emptyState("Пока нечего выбирать", "Добавь задание с дедлайном — и здесь появится рекомендация.", "Добавить задание")}</div>`;
      return;
    }
    const risk = riskLevel(task);
    $("focus-task-area").innerHTML = `<section class="focus-task-card">
      <div class="focus-card-top"><p class="eyebrow">ТВОЙ СЛЕДУЮЩИЙ ШАГ</p><span class="risk-pill ${risk.level==="medium"?"medium":risk.level==="low"?"safe":""}">${escapeHtml(risk.label)}</span></div>
      <h3>${escapeHtml(task.title)}</h3><div class="focus-description">${escapeHtml(task.subject || "Без предмета")} · срок ${fmtDate(task.due)}</div>
      <div class="focus-details"><span class="detail-chip">◷ ${hoursText(task.hours)} на работу</span><span class="detail-chip">↗ ${task.priority==="high"?"Высокий приоритет":task.priority==="low"?"Низкий приоритет":"Обычный приоритет"}</span><span class="detail-chip">⌁ ${dueText(task)}</span></div>
      <p class="rec-reason">${recommendationReason(task)}</p>
      ${task.step ? `<div class="focus-step-box">↳ Начни с этого: ${escapeHtml(task.step)}</div>` : `<div class="focus-step-box">↳ Попробуй начать с 10 минут: открой материалы и запиши первый конкретный шаг.</div>`}
      <div class="focus-buttons"><button class="button button-primary" data-action="toggle" data-id="${escapeHtml(task.id)}">✓ Отметить выполненным</button><button class="button button-secondary" data-action="edit" data-id="${escapeHtml(task.id)}">Изменить задание</button></div>
    </section>`;
  }
  function renderAll() {
    renderOverview();
    renderTasks();
    renderFocus();
  }
  function setView(view) {
    activeView = view;
    document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === `view-${view}`));
    document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
    const titles = {
      overview:["ТВОЙ УЧЕБНЫЙ РИТМ","Привет. Разберёмся по порядку.","Сначала увидим нагрузку — потом выберем следующий шаг."],
      tasks:["ТВОЙ СПИСОК","Все задания в одном месте.","Добавляй, уточняй и закрывай задачи по мере выполнения."],
      focus:["ОДИН ШАГ ЗА РАЗ","Что делать прямо сейчас?","Не нужно решать всё сразу. Выбери одну задачу и начни."]
    };
    $("greeting-eyebrow").textContent = titles[view][0];
    $("page-title").textContent = titles[view][1];
    $("page-subtitle").textContent = titles[view][2];
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function openDialog(task=null) {
    $("task-form").reset();
    $("form-error").textContent = "";
    $("task-id").value = task ? task.id : "";
    $("dialog-title").textContent = task ? "Изменить задание" : "Добавить задание";
    $("task-title").value = task ? task.title : "";
    $("task-subject").value = task ? task.subject || "" : "";
    $("task-due").value = task ? task.due : localDateString(today);
    $("task-hours").value = task ? String(task.hours) : "1";
    $("task-step").value = task ? task.step || "" : "";
    const priority = task ? task.priority || "normal" : "normal";
    const radio = document.querySelector(`input[name="priority"][value="${priority}"]`);
    if (radio) radio.checked = true;
    $("task-dialog").showModal();
    setTimeout(() => $("task-title").focus(), 50);
  }
  function closeDialog() { $("task-dialog").close(); }
  function handleSubmit(event) {
    event.preventDefault();
    const title = $("task-title").value.trim();
    const due = $("task-due").value;
    if (!title || !due) { $("form-error").textContent = "Заполни название и дедлайн."; return; }
    if (!parseDate(due)) { $("form-error").textContent = "Проверь дату дедлайна."; return; }
    const id = $("task-id").value;
    const existing = tasks.find(t => t.id === id);
    const item = {
      id: id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      title, subject: $("task-subject").value.trim(), due,
      hours: Number($("task-hours").value) || 1,
      priority: document.querySelector('input[name="priority"]:checked')?.value || "normal",
      step: $("task-step").value.trim(),
      status: existing ? existing.status : "active",
      createdAt: existing ? existing.createdAt : Date.now()
    };
    if (existing) tasks = tasks.map(t => t.id === id ? item : t);
    else tasks.push(item);
    saveTasks();
    closeDialog();
    renderAll();
    showToast(existing ? "Задание обновлено" : "Задание добавлено");
  }
  function handleAction(action, id) {
    if (action === "add") { openDialog(); return; }
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (action === "toggle") {
      task.status = isDone(task) ? "active" : "done";
      saveTasks(); renderAll();
      showToast(isDone(task) ? "Отлично! Задание выполнено" : "Задание возвращено в активные");
    } else if (action === "edit") {
      openDialog(task);
    } else if (action === "delete") {
      if (!confirm(`Удалить задание «${task.title}»?`)) return;
      tasks = tasks.filter(t => t.id !== id);
      saveTasks(); renderAll(); showToast("Задание удалено");
    }
  }
  document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.goto)));
  $("open-add").addEventListener("click", () => openDialog());
  $("close-dialog").addEventListener("click", closeDialog);
  $("cancel-dialog").addEventListener("click", closeDialog);
  $("task-dialog").addEventListener("click", event => { if (event.target === $("task-dialog")) closeDialog(); });
  $("task-form").addEventListener("submit", handleSubmit);
  $("task-search").addEventListener("input", renderTasks);
  $("task-filter").addEventListener("change", renderTasks);
  document.addEventListener("click", event => {
    const target = event.target.closest("[data-action]");
    if (target) handleAction(target.dataset.action, target.dataset.id);
  });
  $("today-label").textContent = new Intl.DateTimeFormat("ru-RU", {weekday:"long",day:"numeric",month:"long"}).format(today);
  renderAll();
})();