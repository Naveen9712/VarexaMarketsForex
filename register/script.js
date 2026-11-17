/* =========================================================
   Varexa Markets — registration form (register/index.html)
   Front-end prototype only: validates in the browser and
   shows a confirmation. NOTHING is sent to a server or stored.
   Connect the submit handler to the real backend / WordPress
   form plugin before launch.
   ========================================================= */
(function () {
  "use strict";

  const form = document.getElementById("regForm");
  if (!form) return;

  const steps = [...form.querySelectorAll(".reg-step")];
  const total = steps.length;
  const stepItems = [...document.querySelectorAll("#regSteps li")];
  const backBtn = document.getElementById("regBack");
  const nextBtn = document.getElementById("regNext");
  const submitBtn = document.getElementById("regSubmit");
  const live = document.getElementById("regLive");
  let current = 1;
  let reached = 1;

  /* ---------- Country lists (names from the browser, ISO 3166-1 codes) ---------- */
  const CODES = ("AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW").split(" ");
  // Calling codes for the phone field (used to suggest a code from the country of residence)
  const DIAL = { AF:93, AL:355, DZ:213, AD:376, AO:244, AG:1, AR:54, AM:374, AW:297, AU:61, AT:43, AZ:994, BS:1, BH:973, BD:880, BB:1, BY:375, BE:32, BZ:501, BJ:229, BM:1, BT:975, BO:591, BA:387, BW:267, BR:55, BN:673, BG:359, BF:226, BI:257, CV:238, KH:855, CM:237, CA:1, KY:1, CF:236, TD:235, CL:56, CN:86, CO:57, KM:269, CG:242, CD:243, CR:506, CI:225, HR:385, CU:53, CW:599, CY:357, CZ:420, DK:45, DJ:253, DM:1, DO:1, EC:593, EG:20, SV:503, GQ:240, ER:291, EE:372, SZ:268, ET:251, FJ:679, FI:358, FR:33, GA:241, GM:220, GE:995, DE:49, GH:233, GI:350, GR:30, GD:1, GT:502, GN:224, GW:245, GY:592, HT:509, HN:504, HK:852, HU:36, IS:354, IN:91, ID:62, IR:98, IQ:964, IE:353, IL:972, IT:39, JM:1, JP:81, JO:962, KZ:7, KE:254, KI:686, KR:82, KW:965, KG:996, LA:856, LV:371, LB:961, LS:266, LR:231, LY:218, LI:423, LT:370, LU:352, MO:853, MG:261, MW:265, MY:60, MV:960, ML:223, MT:356, MH:692, MR:222, MU:230, MX:52, FM:691, MD:373, MC:377, MN:976, ME:382, MA:212, MZ:258, MM:95, NA:264, NR:674, NP:977, NL:31, NZ:64, NI:505, NE:227, NG:234, MK:389, NO:47, OM:968, PK:92, PW:680, PS:970, PA:507, PG:675, PY:595, PE:51, PH:63, PL:48, PT:351, PR:1, QA:974, RO:40, RU:7, RW:250, KN:1, LC:1, VC:1, WS:685, SM:378, ST:239, SA:966, SN:221, RS:381, SC:248, SL:232, SG:65, SK:421, SI:386, SB:677, SO:252, ZA:27, SS:211, ES:34, LK:94, SD:249, SR:597, SE:46, CH:41, SY:963, TW:886, TJ:992, TZ:255, TH:66, TL:670, TG:228, TO:676, TT:1, TN:216, TR:90, TM:993, UG:256, UA:380, AE:971, GB:44, US:1, UY:598, UZ:998, VU:678, VE:58, VN:84, YE:967, ZM:260, ZW:263 };

  let regionName = (c) => c;
  try { const dn = new Intl.DisplayNames(["en"], { type: "region" }); regionName = (c) => dn.of(c) || c; } catch (e) { /* older browsers show codes */ }
  const countries = CODES.map((c) => ({ code: c, name: regionName(c) })).sort((a, b) => a.name.localeCompare(b.name));

  form.querySelectorAll("select[data-countries]").forEach((sel) => {
    sel.insertAdjacentHTML("beforeend", countries.map((c) => `<option value="${c.code}">${c.name}</option>`).join(""));
  });
  const dialSel = form.querySelector("select[data-dialcodes]");
  if (dialSel) {
    const codes = [...new Set(Object.values(DIAL))].sort((a, b) => a - b);
    dialSel.insertAdjacentHTML("beforeend", codes.map((d) => `<option value="+${d}">+${d}</option>`).join(""));
    let touched = false;
    dialSel.addEventListener("change", () => { touched = true; });
    form.elements.residence.addEventListener("change", (e) => {
      const d = DIAL[e.target.value];
      if (d && !touched) dialSel.value = "+" + d;
    });
  }

  /* ---------- Preselect interest from ?interest=... (links from service buttons) ---------- */
  const want = new URLSearchParams(location.search).get("interest");
  if (want) {
    const box = form.querySelector(`input[name="interest"][data-key="${CSS.escape(want)}"]`);
    if (box) box.checked = true;
  }

  /* ---------- Corporate fields ---------- */
  const corp = form.querySelector(".corp-only");
  const syncCorp = () => {
    const isCorp = form.elements.accountType.value === "Corporate";
    corp.hidden = !isCorp;
    corp.querySelectorAll("[data-required]").forEach((el) => { el.required = isCorp; });
  };
  form.querySelectorAll('input[name="accountType"]').forEach((r) => r.addEventListener("change", () => { syncCorp(); clearGroup("accountType"); }));

  /* ---------- Validation ---------- */
  const RULES = {
    name: (v) => /^[\p{L}][\p{L}' .-]{0,59}$/u.test(v.trim()),
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    phone: (v) => { const d = v.replace(/[\s()-]/g, ""); return /^\d{6,14}$/.test(d); },
    postcode: (v) => /^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(v.trim()),
    referral: (v) => v.trim() === "" || /^[A-Za-z0-9-]{3,20}$/.test(v.trim()),
    adult: (v) => {
      if (!v) return false;
      const dob = new Date(v + "T00:00:00"); const now = new Date();
      if (isNaN(dob)) return false;
      let age = now.getFullYear() - dob.getFullYear();
      const m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
      return age >= 18 && age <= 110;
    },
    password: (v) => Object.values(pwChecks(v)).every(Boolean),
    match: (v) => v !== "" && v === form.elements.password.value,
  };
  function pwChecks(v) {
    return { len: v.length >= 8, upper: /[A-Z]/.test(v), lower: /[a-z]/.test(v), num: /\d/.test(v), sym: /[^A-Za-z0-9]/.test(v) };
  }

  function fieldOf(el) { return el.closest(".field"); }
  function validateEl(el) {
    if (el.disabled || el.type === "radio" || el.type === "checkbox") return true;
    if (el.closest("[hidden]")) return true;
    const v = el.value;
    let ok = true;
    if (el.required && v.trim() === "") ok = false;
    else if (el.dataset.rule && RULES[el.dataset.rule] && (v.trim() !== "" || el.required)) ok = RULES[el.dataset.rule](v);
    const f = fieldOf(el);
    // the phone field has two controls sharing one error
    if (f && el.name === "phone") ok = ok && form.elements.phoneCode.value !== "";
    if (f && el.name === "phoneCode") { validateEl(form.elements.phone); return ok; }
    if (f) f.classList.toggle("invalid", !ok);
    el.setAttribute("aria-invalid", String(!ok));
    return ok;
  }
  function groupErr(name) { return form.querySelector(`.group-err[data-for="${name}"]`); }
  function showGroup(name, show) { const e = groupErr(name); if (e) e.classList.toggle("show", show); }
  function clearGroup(name) { showGroup(name, false); }

  function validateStep(n) {
    const step = steps[n - 1];
    let firstBad = null;
    step.querySelectorAll("input, select, textarea").forEach((el) => {
      if (!validateEl(el) && !firstBad) firstBad = el;
    });
    // radio groups
    ["accountType", "experience", "pep"].forEach((name) => {
      const radios = step.querySelectorAll(`input[name="${name}"]`);
      if (!radios.length) return;
      const ok = [...radios].some((r) => r.checked);
      showGroup(name, !ok);
      if (!ok && !firstBad) firstBad = radios[0];
    });
    // at least one interest
    const interests = step.querySelectorAll('input[name="interest"]');
    if (interests.length) {
      const ok = [...interests].some((c) => c.checked);
      showGroup("interest", !ok);
      if (!ok && !firstBad) firstBad = interests[0];
    }
    // agreements
    const agrees = step.querySelectorAll(".agree:not(.optional) input");
    if (agrees.length) {
      const ok = [...agrees].every((c) => c.checked);
      agrees.forEach((c) => c.closest(".agree").classList.toggle("invalid", !c.checked));
      showGroup("agreements", !ok);
      if (!ok && !firstBad) firstBad = [...agrees].find((c) => !c.checked);
    }
    if (firstBad) {
      firstBad.focus({ preventScroll: true });
      (firstBad.closest(".field, .choice-grid, .chip-grid, .seg, .agree") || firstBad).scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return !firstBad;
  }

  // validate on blur once the user has interacted; re-check live after an error
  form.addEventListener("focusout", (e) => {
    const el = e.target;
    if (el.matches("input, select") && el.type !== "radio" && el.type !== "checkbox" && (el.value !== "" || fieldOf(el)?.classList.contains("invalid"))) validateEl(el);
  });
  form.addEventListener("input", (e) => {
    const el = e.target;
    if (fieldOf(el)?.classList.contains("invalid")) validateEl(el);
    if (el.name === "password") { updatePw(); if (form.elements.password2.value) validateEl(form.elements.password2); }
  });
  form.addEventListener("change", (e) => {
    const el = e.target;
    if (el.type === "radio") clearGroup(el.name);
    if (el.name === "interest") clearGroup("interest");
    if (el.closest(".agree")) { el.closest(".agree").classList.remove("invalid"); if ([...form.querySelectorAll(".agree:not(.optional) input")].every((c) => c.checked)) clearGroup("agreements"); }
    if (el.tagName === "SELECT" && fieldOf(el)?.classList.contains("invalid")) validateEl(el);
  });

  /* ---------- Password strength ---------- */
  const pwBar = document.getElementById("pwBar");
  function updatePw() {
    const c = pwChecks(form.elements.password.value);
    document.querySelectorAll("#pwRules li").forEach((li) => li.classList.toggle("ok", c[li.dataset.rule]));
    const score = Object.values(c).filter(Boolean).length;
    pwBar.style.width = (score / 5) * 100 + "%";
    pwBar.dataset.level = score <= 2 ? "weak" : score <= 4 ? "fair" : "strong";
  }
  form.querySelectorAll("[data-toggle-pw]").forEach((b) => b.addEventListener("click", () => {
    const input = b.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    b.classList.toggle("on", show);
  }));

  /* ---------- Step navigation ---------- */
  function go(n, focus = true) {
    current = n; reached = Math.max(reached, n);
    steps.forEach((s, i) => { s.hidden = i !== n - 1; });
    stepItems.forEach((li, i) => {
      const s = i + 1;
      li.classList.toggle("is-current", s === n);
      li.classList.toggle("is-done", s < reached || (s < n));
      const btn = li.querySelector("button");
      btn.disabled = s > reached || s === n;
      if (s === n) btn.setAttribute("aria-current", "step"); else btn.removeAttribute("aria-current");
    });
    backBtn.hidden = n === 1;
    nextBtn.hidden = n === total;
    submitBtn.hidden = n !== total;
    const name = steps[n - 1].dataset.name;
    document.getElementById("regStepLabel").textContent = `Step ${n} of ${total}`;
    document.getElementById("regStepName").textContent = name;
    document.getElementById("regProgressFill").style.width = (n / total) * 100 + "%";
    live.textContent = `Step ${n} of ${total}: ${name}`;
    if (n === total) renderReview();
    if (focus) {
      const top = document.querySelector(".reg-main").getBoundingClientRect().top + window.scrollY - 100;
      if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
      steps[n - 1].querySelector(".reg-legend").setAttribute("tabindex", "-1");
      steps[n - 1].querySelector(".reg-legend").focus({ preventScroll: true });
    }
  }
  nextBtn.addEventListener("click", () => { if (validateStep(current)) go(current + 1); });
  backBtn.addEventListener("click", () => go(current - 1));
  stepItems.forEach((li, i) => li.querySelector("button").addEventListener("click", () => {
    // allow jumping back, or forward to a step already reached if the current one is valid
    if (i + 1 < current || validateStep(current)) go(i + 1);
  }));
  // Enter in a text field moves to the next step instead of submitting
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && !["checkbox", "radio", "submit"].includes(e.target.type) && current < total) {
      e.preventDefault(); nextBtn.click();
    }
  });

  /* ---------- Review ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const country = (c) => (countries.find((x) => x.code === c) || {}).name || "";
  function renderReview() {
    const f = form.elements;
    const val = (n) => (f[n] && f[n].value ? f[n].value : "");
    const interests = [...form.querySelectorAll('input[name="interest"]:checked')].map((c) => c.value).join(", ");
    const dob = val("dob") ? new Date(val("dob") + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
    const sections = [
      [1, "Account type", [["Account type", val("accountType")], ["Interested in", interests]]],
      [2, "Personal details", [
        ["Name", [val("title"), val("firstName"), val("lastName")].filter(Boolean).join(" ")],
        ["Date of birth", dob], ["Nationality", country(val("nationality"))], ["Country of residence", country(val("residence"))],
        ...(val("accountType") === "Corporate" ? [["Company", val("companyName")], ["Registration no.", val("companyNumber")], ["Incorporated in", country(val("companyCountry"))], ["Your role", val("companyRole")]] : []),
      ]],
      [3, "Contact and address", [
        ["Email", val("email")], ["Mobile", `${val("phoneCode")} ${val("phone")}`.trim()],
        ["Address", [val("address1"), val("address2"), val("city"), val("region"), val("postcode")].filter(Boolean).join(", ")],
        ["Language", val("language")], ["Referral code", val("referral") || "None"],
      ]],
      [4, "Trading profile", [
        ["Employment", val("employment")], ["Source of funds", val("funds")], ["Annual income", val("income") ? val("income") + " USD" : ""],
        ["Net worth", val("netWorth") ? val("netWorth") + " USD" : ""], ["Experience", val("experience")], ["Objective", val("objective")], ["Politically exposed", val("pep")],
      ]],
      [5, "Security and agreements", [
        ["Password", "Set (hidden)"], ["Agreements", "Client Agreement, Privacy Policy and Risk Disclosure accepted"], ["Marketing emails", f.marketing.checked ? "Yes" : "No"],
      ]],
    ];
    document.getElementById("regReview").innerHTML = sections.map(([n, title, rows]) => `
      <section class="review-card">
        <header><h3>${title}</h3><button type="button" class="review-edit" data-goto-step="${n}"><i data-lucide="pencil"></i> Edit</button></header>
        <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || "—")}</dd></div>`).join("")}</dl>
      </section>`).join("");
    document.querySelectorAll("[data-goto-step]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.gotoStep)));
    if (window.lucide) window.lucide.createIcons();
  }

  /* ---------- Submit (prototype: no data leaves the browser) ---------- */
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    for (let n = 1; n < total; n++) {
      if (!validateStep(n)) { go(n); validateStep(n); return; }
    }
    const name = form.elements.firstName.value.trim();
    document.getElementById("regDoneName").textContent = name ? ", " + name : "";
    form.hidden = true;
    document.querySelector(".reg-progress").hidden = true;
    stepItems.forEach((li) => { li.classList.add("is-done"); li.classList.remove("is-current"); li.querySelector("button").disabled = true; });
    const done = document.getElementById("regDone");
    done.hidden = false;
    done.focus();
    done.scrollIntoView({ behavior: "smooth", block: "start" });
    form.reset(); // clear entered details from the page
  });

  go(1, false);
})();
