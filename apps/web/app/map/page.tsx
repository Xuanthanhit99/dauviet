const layers = [
  ["Địa điểm", "PLACE", "Nơi chốn đã xuất bản trong khung bản đồ."],
  ["Sự kiện", "EVENT", "Sự kiện lịch sử gắn với địa điểm có tọa độ."],
  ["Lãnh thổ", "TERRITORY", "Chỉ xuất hiện khi chọn năm và hình học đã được xuất bản."],
] as const;

const anchors = [
  ["Thế giới", "Nhìn các điểm neo có tầm quan trọng cao trước khi đi sâu."],
  ["Quốc gia → Vùng", "Phóng to để mở thêm lớp địa điểm và sự kiện."],
  ["Địa điểm", "Chọn một dấu vết để đi tiếp tới câu chuyện và nguồn."],
] as const;

export default function MapPage() {
  return <main id="main" className="map-page">
    <section className="map-toolbar" aria-labelledby="map-title">
      <div><div className="eyebrow">Explore Map</div><h1 id="map-title">Khám phá không gian qua thời gian</h1><p>Bản đồ là một lớp khám phá: địa điểm, sự kiện và lãnh thổ được hiển thị theo phạm vi nhìn, mức zoom và thời gian — không suy diễn dữ liệu khi nguồn chưa trả về.</p></div>
      <div className="map-controls" aria-label="Bộ lọc bản đồ">
        <label>Năm lịch sử<input inputMode="numeric" name="year" placeholder="Ví dụ: 1288" /></label>
        <label>Loại địa điểm<select name="types" defaultValue=""><option value="">Tất cả</option><option value="HERITAGE_SITE">Di sản</option><option value="ARCHAEOLOGICAL_SITE">Khảo cổ</option><option value="MONUMENT">Di tích</option></select></label>
        <button type="button" className="button button-gold">Áp dụng</button>
      </div>
    </section>
    <section className="map-workspace" aria-label="Không gian khám phá bản đồ">
      <div className="map-canvas" role="region" aria-label="Bản đồ Dấu Việt">
        <div className="map-empty"><strong>Bản đồ đang chờ dữ liệu theo khung nhìn</strong><span>Frontend sẽ gọi <code>/v1/map/features</code> với bbox bắt buộc và zoom hiện tại. Không dùng điểm giả để lấp bản đồ.</span></div>
        <div className="map-zoom" aria-label="Điều khiển thu phóng"><button type="button" aria-label="Phóng to">+</button><button type="button" aria-label="Thu nhỏ">−</button></div>
      </div>
      <aside className="map-results" aria-label="Danh sách đồng bộ với bản đồ">
        <div className="eyebrow">Trong khung nhìn</div><h2>Những dấu vết có thể khám phá</h2><p className="map-note">Danh sách này là bản sao truy cập được của các thực thể đang hiển thị trên bản đồ. Khi API trả về <code>meta.truncated</code>, giao diện sẽ yêu cầu phóng to thay vì đoán thêm kết quả.</p>
        <div className="layer-list">{layers.map(([name,type,desc])=><article key={type} className="layer-card"><span className="map-marker" aria-hidden="true"/><div><strong>{name}</strong><small>{type}</small><p>{desc}</p></div></article>)}</div>
      </aside>
    </section>
    <section className="map-context"><div className="container"><div className="section-head"><div><div className="eyebrow">Spatial hierarchy</div><h2>Từ toàn cảnh đến từng dấu vết</h2></div><p className="section-lead">Mật độ do backend quyết định theo zoom: zoom quốc gia chỉ trả các điểm quan trọng; khi đi sâu, nhiều thực thể hơn được mở ra.</p></div><div className="map-anchor-grid">{anchors.map(([title,copy],i)=><article key={title}><span>0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>
  </main>;
}
