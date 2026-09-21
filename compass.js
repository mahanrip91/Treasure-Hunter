(function(){
  // IMPORTANT:
  // app.js owns the ONE Supabase client.
  // Never create another GoTrueClient here.
  const compassDb=
    window.__TREASURE_HUNTER_DB;

  if(!compassDb){
    console.error(
      "[COMPASS] Shared Supabase client is unavailable."
    );
    return;
  }

  let heading=null;
  let smoothHeading=null;
  let orientationStarted=false;
  let locationWatch=null;
  let lastSent=null;
  let lastSentAt=0;
  let target=null;

  const norm=d=>((d%360)+360)%360;

  const delta=(a,b)=>((a-b+540)%360)-180;

  const smooth=(from,to,amount)=>
    norm(from+delta(to,from)*amount);

  function screenAngle(){
    return Number(
      window.screen?.orientation?.angle ||
      window.orientation ||
      0
    );
  }

  function getHeading(e){

    // iPhone / Safari
    if(
      typeof e.webkitCompassHeading==="number" &&
      e.webkitCompassHeading>=0
    ){
      return norm(e.webkitCompassHeading);
    }

    // Android / Chromium
    if(typeof e.alpha==="number"){
      return norm(
        360-e.alpha+screenAngle()
      );
    }

    return null;
  }

  function bearing(a,b,c,d){

    const p1=a*Math.PI/180;
    const p2=c*Math.PI/180;

    const dl=(d-b)*Math.PI/180;

    const y=Math.sin(dl)*Math.cos(p2);

    const x=
      Math.cos(p1)*Math.sin(p2)-
      Math.sin(p1)*Math.cos(p2)*Math.cos(dl);

    return(
      Math.atan2(y,x)*180/Math.PI+360
    )%360;
  }

  /*
    قطب‌نمای آسیب‌دیده بازی

    اختلال اینجا به صورت یک مقدار لحظه‌ای نیست.
    یک offset واقعی و پایدار داریم که آرام‌آرام تغییر می‌کند.

    نتیجه:
    - عقربه ناگهان 90 درجه نمی‌پرد.
    - می‌تواند واقعاً تا +90 یا -90 درجه منحرف شود.
    - بعد آرام برمی‌گردد یا به سمت دیگری منحرف می‌شود.
    - با چرخاندن گوشی، کل قطب‌نما همچنان زنده و طبیعی کار می‌کند.
  */

  let disturbanceOffset=0;
  let disturbanceTarget=0;
  let disturbanceLastTargetAt=0;
  let disturbanceTargetStartedAt=0;
  let disturbanceSequence=null;

  function randomDisturbanceTarget(){

    /*
      هر بار یکی از نقاط مختلف بازه
      -90 تا +90 انتخاب می‌شود.
    */
    return -90+
      Math.random()*180;
  }

  function updateDisturbance(seq){

    const now=Date.now();

    /*
      با عوض شدن گنج، اختلال جدید ساخته شود.
    */
    if(disturbanceSequence!==seq){

      disturbanceSequence=seq;

      disturbanceOffset=0;

      disturbanceTarget=
        randomDisturbanceTarget();

      disturbanceLastTargetAt=now;

      disturbanceTargetStartedAt=now;
    }

    /*
      هر 7 تا 13 ثانیه مقصد اختلال عوض می‌شود.
      این باعث می‌شود قطب‌نما یک مدت واقعاً
      گمراه‌کننده بماند و بعد آرام تغییر کند.
    */
    const targetDuration=
      7000+
      ((Math.abs(seq*7919)%6000));

    if(
      now-disturbanceLastTargetAt>
      targetDuration
    ){

      disturbanceTarget=
        randomDisturbanceTarget();

      disturbanceLastTargetAt=now;

      disturbanceTargetStartedAt=now;
    }

    /*
      حرکت نرم به سمت مقدار جدید.
      هیچ teleport ناگهانی نداریم.
    */
    const difference=
      delta(
        disturbanceTarget,
        disturbanceOffset
      );

    /*
      سرعت کم:
      تقریباً چند ثانیه طول می‌کشد
      تا از یک سمت به سمت دیگر برود.
    */
    const maxStep=0.55;

    if(Math.abs(difference)<=maxStep){

      disturbanceOffset=
        disturbanceTarget;

    }else{

      disturbanceOffset +=
        Math.sign(difference)*
        maxStep;
    }

    /*
      اطمینان نهایی:
      اختلال هیچ‌وقت از -90/+90 عبور نمی‌کند.
    */
    disturbanceOffset=
      Math.max(
        -90,
        Math.min(
          90,
          disturbanceOffset
        )
      );

    return disturbanceOffset;
  }

  function targetBearingWithNoise(){

    if(
      !target ||
      !window.__compassPosition
    ){
      return null;
    }

    const p=
      window.__compassPosition;

    const base=
      bearing(
        p.latitude,
        p.longitude,
        target.latitude,
        target.longitude
      );

    const seq=
      Number(
        target.sequence||1
      );

    /*
      اختلال اصلیِ پایدار و نرم.
    */
    const disturbance=
      updateDisturbance(seq);

    /*
      یک نوسان بسیار کوچک طبیعی هم اضافه می‌کنیم
      تا عقربه کاملاً مصنوعی به نظر نرسد.
      این مقدار عمداً کوچک است.
    */
    const t=
      Date.now()/1800;

    const microDrift=
      Math.sin(t)*1.8+
      Math.sin(t*0.37+seq)*1.2;

    return norm(
      base+
      disturbance+
      microDrift
    );
  }

  function render(){

    const compass=document.getElementById("compass");
    const needle=document.querySelector(
      "#compass .needle"
    );

    if(
      !compass ||
      heading===null
    ){
      return;
    }

    /*
      خود صفحه قطب‌نما با جهت گوشی
      نسبت به شمال می‌چرخد.
    */
    compass.style.transform=
      `rotate(${-heading}deg)`;

    const targetBearing=
      targetBearingWithNoise();

    if(
      needle &&
      targetBearing!==null
    ){

      needle.style.transform=
        `translateX(-50%) rotate(${targetBearing}deg)`;
    }
  }

  function onOrientation(e){

    const h=getHeading(e);

    if(h===null)return;

    if(smoothHeading===null){

      smoothHeading=h;

    }else{

      smoothHeading=
        smooth(
          smoothHeading,
          h,
          .22
        );
    }

    heading=smoothHeading;

    render();
  }

  async function startOrientation(){

    if(orientationStarted){
      return true;
    }

    try{

      /*
        iOS و بعضی مرورگرها Permission می‌خواهند.
        true یعنی absolute orientation / magnetometer.
      */
      if(
        window.DeviceOrientationEvent &&
        typeof DeviceOrientationEvent.requestPermission==="function"
      ){

        const result=
          await DeviceOrientationEvent.requestPermission(true);

        if(result!=="granted"){

          console.warn(
            "Device orientation permission:",
            result
          );

          return false;
        }
      }

      window.addEventListener(
        "deviceorientationabsolute",
        onOrientation,
        true
      );

      window.addEventListener(
        "deviceorientation",
        onOrientation,
        true
      );

      orientationStarted=true;

      return true;

    }catch(err){

      console.warn(
        "Compass permission/start failed:",
        err
      );

      return false;
    }
  }

  async function refreshTarget(){

    const {
      data:{session}
    }=await compassDb.auth.getSession();

    if(!session)return;

    const {
      data,
      error
    }=await compassDb
      .from("treasures")
      .select(
        "latitude,longitude,sequence,radius_m"
      )
      .eq(
        "user_id",
        session.user.id
      )
      .eq(
        "found",
        false
      )
      .order(
        "sequence",
        {ascending:true}
      )
      .limit(1)
      .maybeSingle();

    if(!error){

      target=data||null;

      render();
    }
  }

  /*
    ارسال موقعیت فعلی به جدول locations
    تا backend.py بتواند آن را بردارد
    و برای Telegram بفرستد.
  */
  function startLocationReporter(){

    if(
      locationWatch!==null ||
      !navigator.geolocation
    ){
      return;
    }

    locationWatch=
      navigator.geolocation.watchPosition(
        async pos=>{

          const {
            data:{session}
          }=await compassDb.auth.getSession();

          if(!session)return;

          const p=pos.coords;

          window.__compassPosition={
            latitude:p.latitude,
            longitude:p.longitude
          };

          const now=Date.now();

          const moved=
            lastSent
            ?
            Math.hypot(
              (p.latitude-lastSent.lat)*111320,
              (p.longitude-lastSent.lon)*
              111320*
              Math.cos(
                p.latitude*Math.PI/180
              )
            )
            :
            Infinity;

          /*
            حداقل 20 متر حرکت
            یا 15 ثانیه فاصله
          */
          if(
            lastSent &&
            moved<20 &&
            now-lastSentAt<15000
          ){

            render();
            return;
          }

          const username=
            session.user.user_metadata?.username ||
            session.user.email?.split("@")[0] ||
            "Unknown";

          const {
            error
          }=await compassDb
            .from("locations")
            .insert({

              username,

              latitude:p.latitude,

              longitude:p.longitude,

              accuracy:
                p.accuracy ?? null,

              location_timestamp:
                Date.now()
            });

          if(error){

            console.warn(
              "LOCATION REPORT ERROR:",
              error
            );

          }else{

            lastSent={
              lat:p.latitude,
              lon:p.longitude
            };

            lastSentAt=now;
          }

          render();
        },

        err=>{
          console.warn(
            "LOCATION WATCH ERROR:",
            err
          );
        },

        {
          enableHighAccuracy:true,
          maximumAge:5000,
          timeout:15000
        }
      );
  }

  function boot(){

    /*
      اولین کلیک کاربر می‌تواند
      Permission سنسور را فعال کند.
    */

    const start=
      document.getElementById(
        "startAdventure"
      );

    if(start){

      start.addEventListener(
        "click",
        startOrientation
      );
    }

    document
      .querySelectorAll(
        '[data-page="game"]'
      )
      .forEach(el=>{

        el.addEventListener(
          "click",
          startOrientation
        );
      });

    const continueAdventure=
      document.getElementById(
        "continueAdventure"
      );

    if(continueAdventure){

      continueAdventure.addEventListener(
        "click",
        startOrientation
      );
    }

    const scan=
      document.getElementById(
        "scanBtn"
      );

    if(scan){

      scan.addEventListener(
        "click",
        startOrientation
      );
    }

    /*
      وقتی صفحه شکار باز شد، قطب‌نما نباید
      منتظر «شناسایی دوباره» بماند.
      روی Android معمولاً permission جداگانه
      لازم نیست و listener باید همان ابتدا فعال شود.
    */
    const gamePage=
      document.getElementById("gamePage");

    if(gamePage){

      const observer=
        new MutationObserver(()=>{
          if(
            gamePage.classList.contains("active") ||
            !gamePage.classList.contains("hidden")
          ){
            startOrientation();
          }
        });

      observer.observe(
        gamePage,
        {
          attributes:true,
          attributeFilter:["class"]
        }
      );
    }

    /*
      اگر صفحه شکار از قبل باز بود،
      همان لحظه سنسور را راه بینداز.
    */
    if(
      gamePage &&
      (
        gamePage.classList.contains("active") ||
        !gamePage.classList.contains("hidden")
      )
    ){
      startOrientation();
    }

    /*
      هدف گنج مرتب Refresh می‌شود
      تا بعد از پیدا شدن گنج قبلی،
      هدف بعدی روی قطب‌نما بیاید.
    */

    setInterval(
      refreshTarget,
      1000
    );

    /*
      رندر خیلی سریع برای حرکت نرم قطب‌نما
    */

    setInterval(
      render,
      80
    );

    // Location reporting belongs to app.js.
    // compass.js must NOT create another GPS writer.
    // This also prevents locations.user_id = NULL.

  }

  if(
    document.readyState==="loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      boot
    );

  }else{

    boot();
  }

})();
