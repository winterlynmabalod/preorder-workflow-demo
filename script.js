const PSGC_API = "https://psgc.cloud/api/v2";

const SUBMIT_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxvwfcOXo4D55MclN8SCqc-hQi0ogOik9hIWliDOByEbBeYsrfiChd8nDVHDNH3NIqbHw/exec";

const PRICES = {
  tote: 1599,
  pins: 499,
  caps: 799
};

const SHIPPING = {
  metro: 300,
  provincial: 350
};

const $ = id => document.getElementById(id);

const form = $("preorderForm");

const region = $("region");
const province = $("province");
const city = $("city");
const barangay = $("barangay");

const toteQty = $("toteQty");
const pinsQty = $("pinsQty");
const capsQty = $("capsQty");

const paymentDetails = $("paymentDetails");
const gcashDetails = $("gcashDetails");
const bankDetails = $("bankDetails");
const paypalDetails = $("paypalDetails");

const orderSummary = $("orderSummary");
const summaryTotal = $("summaryTotal");

const formStatus = $("formStatus");
const submitBtn = $("submitBtn");

const instagramSuccess = $("instagramSuccess");

let regionProvinces = [];
let regionCities = [];

let finalOrderMessage = "";

/* =========================================================
   BASIC HELPERS
========================================================= */

const fmt = n =>
  "₱" +
  Number(n || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 0
  });

function intVal(el) {
  const n = parseInt(el?.value || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function value(id) {
  return ($(id)?.value || "").trim();
}

function selected(name) {
  return document.querySelector(
    `input[name="${name}"]:checked`
  )?.value || "";
}

function selectedText(el) {
  return el && el.selectedIndex >= 0
    ? el.options[el.selectedIndex]?.text || ""
    : "";
}

function cleanOptionText(text) {
  if (!text) return "";

  return /^(Select|Loading|Unable|Address service)/i.test(text)
    ? ""
    : text;
}

/* =========================================================
   PSGC ADDRESS
========================================================= */

async function getJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Address data unavailable.");
  }

  const json = await response.json();

  return Array.isArray(json)
    ? json
    : json.data || [];
}

function makeOptions(rows, firstLabel) {
  return (
    `<option value="">${firstLabel}</option>` +
    rows
      .map(
        row =>
          `<option value="${String(
            row.code || row.name
          ).replaceAll('"', "&quot;")}">${row.name}</option>`
      )
      .join("")
  );
}

async function loadRegions() {
  try {
    const rows =
      await getJSON(`${PSGC_API}/regions`);

    region.innerHTML =
      makeOptions(rows, "Select Region");
  } catch (error) {
    region.innerHTML =
      `<option value="">Address service unavailable</option>`;

    formStatus.textContent =
      "The Philippine address list could not load. Please refresh and try again.";
  }
}

region?.addEventListener("change", async () => {
  province.disabled = true;
  city.disabled = true;
  barangay.disabled = true;

  province.innerHTML =
    `<option value="">Loading provinces...</option>`;

  city.innerHTML =
    `<option value="">Select a province first</option>`;

  barangay.innerHTML =
    `<option value="">Select a city / municipality first</option>`;

  if (!region.value) {
    updateSummary();
    return;
  }

  try {
    [regionProvinces, regionCities] =
      await Promise.all([
        getJSON(
          `${PSGC_API}/regions/${encodeURIComponent(
            region.value
          )}/provinces`
        ),
        getJSON(
          `${PSGC_API}/regions/${encodeURIComponent(
            region.value
          )}/cities-municipalities`
        )
      ]);

    const isNCR =
      /NATIONAL CAPITAL REGION|NCR/i.test(
        selectedText(region)
      );

    const specialLabel = isNCR
      ? "Metro Manila / NCR Cities"
      : "Independent / Highly Urbanized Cities";

    province.innerHTML =
      `<option value="">Select Province</option>` +
      `<option value="__independent__">${specialLabel}</option>` +
      regionProvinces
        .map(
          p =>
            `<option value="${p.code}">${p.name}</option>`
        )
        .join("");

    province.disabled = false;
  } catch (error) {
    province.innerHTML =
      `<option value="">Unable to load provinces</option>`;
  }

  updateSummary();
});

province?.addEventListener("change", async () => {
  city.disabled = true;
  barangay.disabled = true;

  city.innerHTML =
    `<option value="">Loading cities / municipalities...</option>`;

  barangay.innerHTML =
    `<option value="">Select a city / municipality first</option>`;

  if (!province.value) {
    updateSummary();
    return;
  }

  try {
    const rows =
      province.value === "__independent__"
        ? regionCities
        : await getJSON(
            `${PSGC_API}/provinces/${encodeURIComponent(
              province.value
            )}/cities-municipalities`
          );

    city.innerHTML =
      makeOptions(
        rows,
        "Select City / Municipality"
      );

    city.disabled = false;
  } catch (error) {
    city.innerHTML =
      `<option value="">Unable to load cities / municipalities</option>`;
  }

  updateSummary();
});

city?.addEventListener("change", async () => {
  barangay.disabled = true;

  barangay.innerHTML =
    `<option value="">Loading barangays...</option>`;

  if (!city.value) {
    updateSummary();
    return;
  }

  try {
    const rows =
      await getJSON(
        `${PSGC_API}/cities-municipalities/${encodeURIComponent(
          city.value
        )}/barangays`
      );

    barangay.innerHTML =
      makeOptions(
        rows,
        "Select Barangay"
      );

    barangay.disabled = false;
  } catch (error) {
    barangay.innerHTML =
      `<option value="">Unable to load barangays</option>`;
  }

  updateSummary();
});

/* =========================================================
   ORDER CALCULATIONS
========================================================= */

function isMetroManila() {
  return /NATIONAL CAPITAL REGION|NCR/i.test(
    selectedText(region)
  );
}

function calculateOrder() {
  const tote = intVal(toteQty);
  const pins = intVal(pinsQty);
  const caps = intVal(capsQty);

  const toteSubtotal =
    tote * PRICES.tote;

  const pinsSubtotal =
    pins * PRICES.pins;

  const capSubtotal =
    caps * PRICES.caps;

  const subtotal =
    toteSubtotal +
    pinsSubtotal +
    capSubtotal;

  const matchingPairs =
    Math.min(tote, pins);

  const totePinsDiscount =
    matchingPairs * 99;

  const freeCaps =
    Math.floor(caps / 10);

  const capPromoDiscount =
    freeCaps * PRICES.caps;

  const totalDiscount =
    totePinsDiscount +
    capPromoDiscount;

  const hasProducts =
    tote + pins + caps > 0;

  const boxes = hasProducts
    ? Math.max(
        Math.ceil(caps / 5),
        tote,
        1
      )
    : 0;

  const deliveryMethod =
    selected("deliveryMethod");

  const shipping =
    deliveryMethod === "Courier Delivery"
      ? boxes *
        (
          isMetroManila()
            ? SHIPPING.metro
            : SHIPPING.provincial
        )
      : 0;

  const total =
    subtotal -
    totalDiscount +
    shipping;

  return {
    tote,
    pins,
    caps,

    toteSubtotal,
    pinsSubtotal,
    capSubtotal,

    subtotal,

    matchingPairs,
    totePinsDiscount,

    freeCaps,
    capPromoDiscount,

    totalDiscount,

    boxes,
    deliveryMethod,
    shipping,
    total
  };
}

/* =========================================================
   PAYMENT UI
========================================================= */

function updatePaymentUI() {
  const method =
    selected("paymentMethod");

  paymentDetails?.classList.toggle(
    "hidden",
    !method
  );

  gcashDetails?.classList.toggle(
    "hidden",
    method !== "GCash"
  );

  bankDetails?.classList.toggle(
    "hidden",
    method !== "Bank Transfer"
  );

  paypalDetails?.classList.toggle(
    "hidden",
    method !== "PayPal"
  );
}

/* =========================================================
   ADDRESS
========================================================= */

function getAddress() {
  return [
    value("house"),
    value("street"),

    cleanOptionText(
      selectedText(barangay)
    ),

    cleanOptionText(
      selectedText(city)
    ),

    province?.value === "__independent__"
      ? ""
      : cleanOptionText(
          selectedText(province)
        ),

    cleanOptionText(
      selectedText(region)
    ),

    value("zip")
  ]
    .filter(Boolean)
    .join(", ");
}

/* =========================================================
   LIVE ORDER SUMMARY
========================================================= */

function updateSummary() {
  const c =
    calculateOrder();

  const paymentMethod =
    selected("paymentMethod");

  const fullName = [
    value("firstName"),
    value("surname")
  ]
    .filter(Boolean)
    .join(" ");

  let html = `
    <div class="summary-group">

      <h3>
        CUSTOMER DETAILS
      </h3>

      <div class="summary-row">
        <span>Name</span>
        <strong>${fullName || "—"}</strong>
      </div>

      <div class="summary-row">
        <span>Instagram</span>
        <strong>${value("instagram") || "—"}</strong>
      </div>

      <div class="summary-row">
        <span>Mobile</span>
        <strong>${value("mobile") || "—"}</strong>
      </div>

      <div class="summary-row">
        <span>Email</span>
        <strong>${value("email") || "—"}</strong>
      </div>

    </div>


    <div class="summary-group">

      <h3>
        DELIVERY DETAILS
      </h3>

      <div class="summary-row">
        <span>Address</span>
        <strong>${getAddress() || "—"}</strong>
      </div>

      <div class="summary-row">
        <span>Delivery Method</span>
        <strong>${c.deliveryMethod || "—"}</strong>
      </div>

    </div>


    <div class="summary-group">

      <h3>
        ORDER
      </h3>
  `;

  if (c.tote) {
    html += `
      <div class="summary-row">
        <span>
          Everyday Tote × ${c.tote}
        </span>
        <strong>
          ${fmt(c.toteSubtotal)}
        </strong>
      </div>
    `;
  }

  if (c.pins) {
    html += `
      <div class="summary-row">
        <span>
          Pin Set × ${c.pins}
        </span>
        <strong>
          ${fmt(c.pinsSubtotal)}
        </strong>
      </div>
    `;
  }

  if (c.caps) {
    html += `
      <div class="summary-row">
        <span>
          Classic Cap × ${c.caps}
        </span>
        <strong>
          ${fmt(c.capSubtotal)}
        </strong>
      </div>
    `;
  }

  if (
    !c.tote &&
    !c.pins &&
    !c.caps
  ) {
    html += `
      <div class="summary-row">
        <span>
          No products selected yet.
        </span>
        <strong>—</strong>
      </div>
    `;
  }

  html += `
    <div class="summary-row">
      <span>Subtotal</span>
      <strong>${fmt(c.subtotal)}</strong>
    </div>
  `;

  if (c.totePinsDiscount) {
    html += `
      <div class="summary-row discount">

        <span>
          Tote + Pin Set Promo
          (${c.matchingPairs}
          matching pair${c.matchingPairs > 1 ? "s" : ""})
        </span>

        <strong>
          −${fmt(c.totePinsDiscount)}
        </strong>

      </div>
    `;
  }

  if (c.capPromoDiscount) {
    html += `
      <div class="summary-row discount">

        <span>
          Buy 10 Caps Promo
          (${c.freeCaps}
          free cap${c.freeCaps > 1 ? "s" : ""})
        </span>

        <strong>
          −${fmt(c.capPromoDiscount)}
        </strong>

      </div>
    `;
  }

  if (c.deliveryMethod) {
    html += `
      <div class="summary-row">
        <span>Shipping</span>
        <strong>${fmt(c.shipping)}</strong>
      </div>
    `;
  }

  html += `
    </div>


    <div class="summary-group">

      <h3>
        PAYMENT
      </h3>

      <div class="summary-row">
        <span>Payment Method</span>
        <strong>${paymentMethod || "—"}</strong>
      </div>

      <div class="summary-row">
        <span>Reference Number</span>
        <strong>
          ${value("paymentReference") || "—"}
        </strong>
      </div>

    </div>
  `;

  if (orderSummary) {
    orderSummary.innerHTML =
      html;
  }

  if (summaryTotal) {
    summaryTotal.textContent =
      fmt(c.total);
  }
}

/* =========================================================
   QUANTITY BUTTONS
========================================================= */

document
  .querySelectorAll(".qty-btn")
  .forEach(btn => {

    btn.addEventListener(
      "click",
      () => {

        const input =
          $(btn.dataset.target);

        const current =
          intVal(input);

        input.value =
          btn.dataset.action === "plus"
            ? current + 1
            : Math.max(
                0,
                current - 1
              );

        updateSummary();
      }
    );

  });

[
  toteQty,
  pinsQty,
  capsQty
].forEach(
  el =>
    el?.addEventListener(
      "input",
      updateSummary
    )
);

/* =========================================================
   FORM CHANGE LISTENERS
========================================================= */

document
  .querySelectorAll(
    'input[name="deliveryMethod"]'
  )
  .forEach(el => {

    el.addEventListener(
      "change",
      updateSummary
    );

  });

document
  .querySelectorAll(
    'input[name="paymentMethod"]'
  )
  .forEach(el => {

    el.addEventListener(
      "change",
      () => {

        updatePaymentUI();
        updateSummary();

      }
    );

  });

form
  ?.querySelectorAll(
    'input:not([type="radio"]):not([type="file"])'
  )
  .forEach(el => {

    el.addEventListener(
      "input",
      updateSummary
    );

  });

region?.addEventListener(
  "change",
  updateSummary
);

province?.addEventListener(
  "change",
  updateSummary
);

city?.addEventListener(
  "change",
  updateSummary
);

barangay?.addEventListener(
  "change",
  updateSummary
);

/* =========================================================
   VALIDATION
========================================================= */

function validate() {
  let valid = true;

  form
    .querySelectorAll("[required]")
    .forEach(el => {

      let ok;

      if (el.type === "radio") {
        ok =
          !!document.querySelector(
            `input[name="${el.name}"]:checked`
          );
      } else {
        ok = !!el.value;
      }

      if (
        el.matches(
          "input,select"
        )
      ) {
        el.classList.toggle(
          "invalid",
          !ok
        );
      }

      if (!ok) {
        valid = false;
      }

    });

  const mobileDigits =
    value("mobile").replace(
      /\D/g,
      ""
    );

  if (
    mobileDigits &&
    !/^(09\d{9}|9\d{9}|63\d{10})$/.test(
      mobileDigits
    )
  ) {

    $("mobile")?.classList.add(
      "invalid"
    );

    valid = false;
  }

  if (
    intVal(toteQty) +
      intVal(pinsQty) +
      intVal(capsQty) ===
    0
  ) {

    alert(
      "Please select at least one demo product."
    );

    valid = false;
  }

  return valid;
}

/* =========================================================
   DEMO TRACKER SUBMISSION DATA
========================================================= */

function buildSubmission() {
  const c =
    calculateOrder();

  return {
    name: [
      value("firstName"),
      value("surname")
    ]
      .filter(Boolean)
      .join(" "),

    instagram:
      value("instagram"),

    mobile:
      value("mobile"),

    email:
      value("email"),

    address:
      getAddress(),

    toteQty:
      c.tote,

    pinsQty:
      c.pins,

    capsQty:
      c.caps,

    subtotal:
      c.subtotal,

    promoDiscount:
      c.totalDiscount,

    shipping:
      c.shipping,

    total:
      c.total,

    deliveryMethod:
      c.deliveryMethod,

    paymentMethod:
      selected(
        "paymentMethod"
      ),

    paymentReference:
      value(
        "paymentReference"
      ),

    source:
      "Portfolio Demo"
  };
}

/* =========================================================
   DEMO ORDER SUMMARY MESSAGE
========================================================= */

function buildDemoOrderSummary() {
  const c =
    calculateOrder();

  const fullName = [
    value("firstName"),
    value("surname")
  ]
    .filter(Boolean)
    .join(" ");

  const paymentMethod =
    selected("paymentMethod");

  const lines = [];

  lines.push(
    "VELORA DEMO PRE-ORDER"
  );

  lines.push(
    "Portfolio Workflow Demonstration"
  );

  lines.push("");

  lines.push(
    "CUSTOMER DETAILS"
  );

  lines.push(
    `Name: ${fullName}`
  );

  lines.push(
    `Instagram: ${value("instagram")}`
  );

  lines.push(
    `Mobile: ${value("mobile")}`
  );

  lines.push(
    `Email: ${value("email")}`
  );

  lines.push("");

  lines.push(
    "ORDER"
  );

  if (c.tote) {
    lines.push(
      `Everyday Tote × ${c.tote} — ${fmt(c.toteSubtotal)}`
    );
  }

  if (c.pins) {
    lines.push(
      `Pin Set × ${c.pins} — ${fmt(c.pinsSubtotal)}`
    );
  }

  if (c.caps) {
    lines.push(
      `Classic Cap × ${c.caps} — ${fmt(c.capSubtotal)}`
    );
  }

  lines.push("");

  lines.push(
    `Subtotal: ${fmt(c.subtotal)}`
  );

  if (c.totePinsDiscount) {
    lines.push(
      `Tote + Pin Set Promo: -${fmt(
        c.totePinsDiscount
      )}`
    );
  }

  if (c.capPromoDiscount) {
    lines.push(
      `Buy 10 Caps Promo: -${fmt(
        c.capPromoDiscount
      )}`
    );
  }

  lines.push(
    `Shipping: ${fmt(c.shipping)}`
  );

  lines.push(
    `TOTAL: ${fmt(c.total)}`
  );

  lines.push("");

  lines.push(
    "DELIVERY"
  );

  lines.push(
    `Method: ${c.deliveryMethod}`
  );

  lines.push(
    `Address: ${getAddress()}`
  );

  lines.push("");

  lines.push(
    "PAYMENT"
  );

  lines.push(
    `Method: ${paymentMethod}`
  );

  lines.push(
    `Demo Reference: ${value(
      "paymentReference"
    )}`
  );

  lines.push("");

  lines.push(
    "DEMO WORKFLOW COMPLETED"
  );

  return lines.join("\n");
}

/* =========================================================
   COPY ORDER SUMMARY
========================================================= */

async function copyOrderSummary() {

  if (!finalOrderMessage) {
    finalOrderMessage =
      buildDemoOrderSummary();
  }

  try {

    await navigator.clipboard.writeText(
      finalOrderMessage
    );

    const copyButton =
      $("copyOrderBtn");

    if (copyButton) {

      const original =
        copyButton.textContent;

      copyButton.textContent =
        "COPIED ✓";

      setTimeout(() => {

        copyButton.textContent =
          original;

      }, 2000);

    }

    const copyStatus =
      $("copyOrderStatus");

    if (copyStatus) {
      copyStatus.textContent =
        "Demo order summary copied to your clipboard.";
    }

  } catch (error) {

    const textarea =
      document.createElement(
        "textarea"
      );

    textarea.value =
      finalOrderMessage;

    textarea.style.position =
      "fixed";

    textarea.style.opacity =
      "0";

    document.body.appendChild(
      textarea
    );

    textarea.select();

    document.execCommand(
      "copy"
    );

    textarea.remove();

    const copyStatus =
      $("copyOrderStatus");

    if (copyStatus) {
      copyStatus.textContent =
        "Demo order summary copied to your clipboard.";
    }

  }
}

/* =========================================================
   RESET DEMO
========================================================= */

function resetDemo() {

  form.reset();

  toteQty.value = 0;
  pinsQty.value = 0;
  capsQty.value = 0;

  finalOrderMessage = "";

  submitBtn.disabled = false;

  submitBtn.textContent =
    "SUBMIT DEMO ORDER";

  formStatus.textContent = "";

  instagramSuccess.classList.add(
    "hidden"
  );

  updatePaymentUI();
  updateSummary();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================================
   SUCCESS SECTION
========================================================= */

function showDemoSuccess() {

  if (!instagramSuccess) {
    return;
  }

  finalOrderMessage =
    buildDemoOrderSummary();

  instagramSuccess.innerHTML = `

    <div class="instagram-success-inner">

      <div class="success-badge">
        DEMO WORKFLOW COMPLETE
      </div>

      <h2>
        Order Processed Successfully ✓
      </h2>

      <p>
        Your test submission has been recorded in the
        demonstration order tracker.
      </p>

      <p>
        This shows how a customer-facing order form can
        feed structured order information into a
        behind-the-scenes administrative workflow.
      </p>


      <div class="workflow-result">

        <div class="workflow-result-item">
          <strong>01</strong>
          <span>Customer Form</span>
        </div>

        <div class="workflow-arrow">
          →
        </div>

        <div class="workflow-result-item">
          <strong>02</strong>
          <span>Order Calculation</span>
        </div>

        <div class="workflow-arrow">
          →
        </div>

        <div class="workflow-result-item">
          <strong>03</strong>
          <span>Demo Tracker</span>
        </div>

      </div>


      <div class="instagram-order-preview">

        <h3>
          GENERATED ORDER SUMMARY
        </h3>

        <pre id="instagramOrderText"></pre>

      </div>


      <button
        type="button"
        id="copyOrderBtn"
        class="instagram-dm-btn copy-order-btn"
      >
        COPY ORDER SUMMARY
      </button>


      <button
        type="button"
        id="resetDemoBtn"
        class="secondary-demo-btn"
      >
        START NEW DEMO
      </button>


      <p
        id="copyOrderStatus"
        class="instagram-copy-status"
      >
        Portfolio demo only — no real payment is processed.
      </p>

    </div>
  `;

  const textPreview =
    $("instagramOrderText");

  if (textPreview) {
    textPreview.textContent =
      finalOrderMessage;
  }

  $("copyOrderBtn")
    ?.addEventListener(
      "click",
      copyOrderSummary
    );

  $("resetDemoBtn")
    ?.addEventListener(
      "click",
      resetDemo
    );

  instagramSuccess.classList.remove(
    "hidden"
  );

  instagramSuccess.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

/* =========================================================
   FORM SUBMIT
========================================================= */

form?.addEventListener(
  "submit",
  async e => {

    e.preventDefault();

    updateSummary();

    if (!validate()) {

      formStatus.textContent =
        "Please complete all required demo fields.";

      return;
    }

    submitBtn.disabled =
      true;

    submitBtn.textContent =
      "PROCESSING DEMO...";

    formStatus.textContent =
      "";

    try {

      const submission =
        buildSubmission();

      await fetch(
        SUBMIT_ENDPOINT,
        {
          method: "POST",

          mode: "no-cors",

          headers: {
            "Content-Type":
              "text/plain;charset=utf-8"
          },

          body:
            JSON.stringify(
              submission
            )
        }
      );

      formStatus.textContent =
        "Demo submission successfully recorded in the portfolio tracker.";

      submitBtn.textContent =
        "DEMO COMPLETED ✓";

      finalOrderMessage =
        buildDemoOrderSummary();

      showDemoSuccess();

    } catch (error) {

      console.error(error);

      formStatus.textContent =
        "The demo could not be completed. Please try again.";

      submitBtn.disabled =
        false;

      submitBtn.textContent =
        "SUBMIT DEMO ORDER";
    }

  }
);

/* =========================================================
   INITIALIZE
========================================================= */

loadRegions();

updatePaymentUI();

updateSummary();
