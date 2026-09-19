const SUPABASE_URL = "https://lscynuqzocuvqrdqigoo.supabase.co";
const SUPABASE_KEY = "sb_publishable__nK_y3ycShuXlzWI0_obCQ_ULYuvMmH";

const startBtn = document.getElementById("startBtn");
const status = document.getElementById("status");

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
        throw new Error(
            `Supabase ${response.status}: ${errorText}`
        );
    }
}

startBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
        status.textContent =
            "موقعیت مکانی توسط این مرورگر پشتیبانی نمی‌شود.";
        return;
    }

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

                document
                    .getElementById("locationBox")
                    .classList.remove("hidden");

                status.textContent =
                    "موقعیت با موفقیت ثبت شد.";

                startBtn.disabled = true;
                startBtn.textContent = "🎮 ورود به بازی";

                startBtn.onclick = () => {
                    status.textContent =
                        "⚠️ بازی در حال آماده‌سازی است.";
                };

            } catch (error) {
                console.error(error);

                status.textContent =
                    "خطا در ثبت موقعیت. لطفاً دوباره تلاش کنید.";
            }
        },

        (error) => {
            console.error(error);

            if (error.code === 1) {
                status.textContent =
                    "دسترسی موقعیت مکانی داده نشد.";
            } else {
                status.textContent =
                    "دریافت موقعیت ناموفق بود. دوباره تلاش کنید.";
            }
        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
});
