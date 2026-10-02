import Image from "next/image";

const discoveries=[
  ["Địa điểm","Đi qua không gian","Khám phá những nơi chốn và lớp lịch sử tạo nên chúng.","/explore","01"],
  ["Câu chuyện","Đi sâu vào thời gian","Theo dấu sự kiện, con người và ký ức qua nguồn tư liệu.","/stories","02"],
  ["Hành trình","Kết nối các dấu vết","Theo những tuyến khám phá liên kết địa điểm, văn hóa và thời gian.","/journeys","03"],
  ["Bản đồ","Nhìn thấy các kết nối","Khám phá không gian bằng bản đồ, thời gian và ngữ cảnh lịch sử.","/map","04"],
] as const;

const nav=[
  ["Khám phá","/explore"],["Bản đồ","/map"],["Câu chuyện","/stories"],["Hành trình","/journeys"]
] as const;

export default function Home(){
 return <div className="home-v5">
  <aside className="home-rail" aria-label="Điều hướng chính">
   <a className="rail-brand" href="/" aria-label="Dấu Việt Global — Trang chủ"><Image src="/brand/dau-viet-global-time-trace-v3-geometry-v1.3-dark.svg" width={56} height={56} priority alt=""/><span>DẤU VIỆT<small>GLOBAL</small></span></a>
   <nav className="rail-nav">{nav.map(([label,href])=><a href={href} key={href}>{label}</a>)}</nav>
   <div className="rail-foot"><a href="/auth/login">Đăng nhập</a><button className="locale" aria-label="Ngôn ngữ hiện tại: Tiếng Việt">VI</button></div>
  </aside>

  <div className="home-stage">
   <header className="site-header home-mobile-header"><div className="container header-inner">
    <a href="/" aria-label="Dấu Việt Global — Trang chủ"><Image className="brand-logo" src="/brand/dvg-logo-horizontal-primary-light-v1.4.1.svg" width={460} height={96} priority alt="Dấu Việt Global"/></a>
    <a className="header-action" href="/auth/login">Đăng nhập</a>
    <a className="mobile-nav" aria-label="Khám phá" href="/explore">Khám phá</a>
   </div></header>

   <main id="main">
    <section className="hero home-hero"><div className="container home-hero-grid">
     <div className="home-hero-copy"><div className="eyebrow">Dấu vết của thời gian · Historical Flow</div><h1>Explore Places.<br/><em>Understand Stories.</em></h1><p className="hero-copy">Khám phá thế giới qua nơi chốn, con người, văn hóa và những câu chuyện có nguồn gốc. Đi từ một điểm trên bản đồ đến những lớp thời gian đã tạo nên nơi đó.</p><div className="hero-actions"><a className="button button-gold" href="/explore">Bắt đầu khám phá</a><a className="button button-quiet" href="/map">Mở bản đồ</a></div>
      <div className="hero-path" aria-label="Mạch khám phá"><span>PLACE</span><i>→</i><span>TIME</span><i>→</i><span>STORY</span><i>→</i><span>JOURNEY</span></div>
     </div>
     <div className="trace-visual home-trace" aria-hidden="true"><span className="trace-year trace-year-a">PAST</span><span className="trace-year trace-year-b">NOW</span><Image className="trace-logo" src="/brand/dau-viet-global-time-trace-v3-geometry-v1.3-dark.svg" width={500} height={500} alt=""/></div>
    </div></section>

    <section className="section home-discover"><div className="container"><div className="section-head"><div><div className="eyebrow">Discover</div><h2>Bắt đầu từ điều bạn muốn hiểu</h2></div><p className="section-lead">Không phải một danh sách điểm đến. Mỗi lối vào mở ra quan hệ giữa không gian, thời gian, con người và bằng chứng.</p></div><div className="discovery-grid home-discovery-grid">{discoveries.map(([k,t,d,h,n])=><a className="discovery-card home-discovery-card dv-motion-panel" href={h} key={h}><span className="card-index">{n}</span><div><span>{k}</span><h3>{t}</h3><p>{d}</p><b>Khám phá →</b></div></a>)}</div></div></section>

    <section className="section story-band home-story"><div className="container story-grid"><article className="story-panel home-story-panel"><div className="story-time-mark">THEN <span/> NOW</div><div className="eyebrow">Story Explorer</div><h2>Một nơi chốn không chỉ có một thời điểm.</h2><p>Theo các lớp thời gian, sự kiện và bằng chứng để hiểu một câu chuyện trong bối cảnh của nó.</p><a className="button button-gold" href="/stories">Khám phá câu chuyện</a></article><div className="connections-column"><div className="eyebrow">Connections</div><h2>Hiểu bằng những kết nối</h2><div className="connections"><div className="connection"><strong>People ↔ Places</strong><span>Con người tạo dấu ấn lên nơi chốn — và nơi chốn lưu lại ký ức của họ.</span></div><div className="connection"><strong>Events ↔ Time</strong><span>Đặt sự kiện vào đúng thời gian và bối cảnh thay vì nhìn như dữ kiện rời rạc.</span></div><div className="connection"><strong>Culture ↔ Sources</strong><span>Đi từ câu chuyện đến nguồn và mức độ chắc chắn của thông tin.</span></div></div></div></div></section>

    <section className="section trust-band home-trust"><div className="container trust-grid"><div><div className="eyebrow">Understand Stories</div><h2>Khám phá với ngữ cảnh và nguồn gốc.</h2><p className="hero-copy">Dấu Việt phân biệt tư liệu, bằng chứng, tái dựng và nội dung cần lưu ý. Khi thông tin chưa chắc chắn, giao diện nói rõ điều đó thay vì biến suy đoán thành sự thật.</p></div><div className="trust-points"><div className="trust-point"><strong>Nguồn & trích dẫn</strong><span>Theo dấu thông tin về nguồn tham chiếu.</span></div><div className="trust-point"><strong>Then & Now</strong><span>So sánh thời gian mà không đánh đồng tái dựng với tư liệu.</span></div><div className="trust-point"><strong>Mức độ chắc chắn</strong><span>Verified, probable, disputed, uncertain và unknown được biểu đạt rõ.</span></div><div className="trust-point"><strong>Media provenance</strong><span>Hình ảnh phải đúng thực thể, nguồn gốc và quyền sử dụng.</span></div></div></div></section>
   </main>

   <footer className="site-footer"><div className="container footer-inner"><div><strong className="footer-brand">DẤU VIỆT GLOBAL</strong><div>Explore Places. Understand Stories.</div></div><div>World → Country → Region → Destination → Place → Story → Journey</div></div></footer>
  </div>
 </div>
}