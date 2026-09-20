import Image from "next/image";

const discoveries=[
  ["Địa điểm","Đi qua không gian","Khám phá những nơi chốn và lớp lịch sử tạo nên chúng.","/explore"],
  ["Câu chuyện","Đi sâu vào thời gian","Theo dấu sự kiện, con người và ký ức qua nguồn tư liệu.","/stories"],
  ["Hành trình","Kết nối các dấu vết","Theo những tuyến khám phá liên kết địa điểm, văn hóa và thời gian.","/journeys"],
  ["Bản đồ","Nhìn thấy các kết nối","Khám phá không gian bằng bản đồ, thời gian và ngữ cảnh lịch sử.","/map"],
] as const;

export default function Home(){
 return <div>
  <header className="site-header"><div className="container header-inner">
   <a href="/" aria-label="Dấu Việt Global — Trang chủ"><Image className="brand-logo" src="/brand/dvg-logo-horizontal-primary-light-v1.4.1.svg" width={460} height={96} priority alt="Dấu Việt Global"/></a>
   <nav className="desktop-nav" aria-label="Điều hướng chính"><a href="/explore">Khám phá</a><a href="/map">Bản đồ</a><a href="/stories">Câu chuyện</a><a href="/journeys">Hành trình</a></nav>
   <div className="header-actions"><button className="locale" aria-label="Ngôn ngữ hiện tại: Tiếng Việt">VI</button><a className="header-action primary-action" href="/explore">Bắt đầu khám phá</a></div>
   <button className="mobile-nav" aria-label="Mở điều hướng" type="button">☰</button>
  </div></header>
  <main id="main">
   <section className="hero"><div className="container hero-grid">
    <div><div className="eyebrow">Dấu vết của thời gian</div><h1>Explore Places. Understand Stories.</h1><p className="hero-copy">Khám phá thế giới qua nơi chốn, con người, văn hóa và những câu chuyện có nguồn gốc. Mỗi địa điểm là một điểm bắt đầu để hiểu điều đã xảy ra, vì sao nó quan trọng và những gì còn hiện diện hôm nay.</p><div className="hero-actions"><a className="button button-gold" href="/explore">Khám phá địa điểm</a><a className="button button-quiet" href="/stories">Đọc một câu chuyện</a></div></div>
    <div className="trace-visual" aria-hidden="true"><Image className="trace-logo" src="/brand/dau-viet-global-time-trace-v3-geometry-v1.3-dark.svg" width={500} height={500} alt=""/></div>
   </div></section>
   <section className="section"><div className="container"><div className="section-head"><div><div className="eyebrow">Discover</div><h2>Bắt đầu từ điều bạn muốn hiểu</h2></div><p className="section-lead">Không chỉ tìm một nơi để đến. Dấu Việt kết nối địa điểm với câu chuyện, thời gian, con người và nguồn tư liệu để việc khám phá có chiều sâu.</p></div><div className="discovery-grid">{discoveries.map(([k,t,d,h])=><a className="discovery-card dv-motion-panel" href={h} key={h}><span>{k}</span><h3>{t}</h3><p>{d}</p></a>)}</div></div></section>
   <section className="section story-band"><div className="container story-grid"><article className="story-panel"><div className="eyebrow">Story Explorer</div><h2>Một nơi chốn không chỉ có một thời điểm.</h2><p>Theo các lớp thời gian, sự kiện và bằng chứng để hiểu một câu chuyện trong bối cảnh của nó.</p><a className="button button-gold" href="/stories">Khám phá câu chuyện</a></article><div><div className="eyebrow">Connections</div><h2>Hiểu bằng những kết nối</h2><div className="connections"><div className="connection"><strong>People ↔ Places</strong><span>Con người tạo dấu ấn lên nơi chốn — và nơi chốn lưu lại ký ức của họ.</span></div><div className="connection"><strong>Events ↔ Time</strong><span>Đặt sự kiện vào đúng thời gian và bối cảnh thay vì nhìn như dữ kiện rời rạc.</span></div><div className="connection"><strong>Culture ↔ Sources</strong><span>Đi từ câu chuyện đến nguồn và mức độ chắc chắn của thông tin.</span></div></div></div></div></section>
   <section className="section trust-band"><div className="container trust-grid"><div><div className="eyebrow">Understand Stories</div><h2>Khám phá với ngữ cảnh và nguồn gốc.</h2><p className="hero-copy">Dấu Việt phân biệt tư liệu, bằng chứng, tái dựng và nội dung cần lưu ý. Khi thông tin chưa chắc chắn, giao diện phải nói rõ điều đó thay vì biến suy đoán thành sự thật.</p></div><div className="trust-points"><div className="trust-point"><strong>Nguồn & trích dẫn</strong><span>Theo dấu thông tin về nguồn tham chiếu.</span></div><div className="trust-point"><strong>Then & Now</strong><span>So sánh thời gian mà không đánh đồng tái dựng với tư liệu.</span></div><div className="trust-point"><strong>Mức độ chắc chắn</strong><span>Verified, probable, disputed, uncertain và unknown được biểu đạt rõ.</span></div><div className="trust-point"><strong>Media provenance</strong><span>Hình ảnh phải đúng thực thể, nguồn gốc và quyền sử dụng.</span></div></div></div></section>
  </main>
  <footer className="site-footer"><div className="container footer-inner"><div><strong className="footer-brand">DẤU VIỆT GLOBAL</strong><div>Explore Places. Understand Stories.</div></div><div>World → Country → Region → Destination → Place → Story → Journey</div></div></footer>
 </div>
}
