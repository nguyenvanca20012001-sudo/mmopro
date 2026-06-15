// src/data/jobs.ts
export const jobsData: Record<string, any> = {

  // ==============================================
  // NHÓM JOB SEEDING & MARKETING TƯƠNG TÁC
  // ==============================================

  'view-tiktok': {
    title: "CÀY VIEW TIKTOK",
    reward: "30.000 xu",
    color: "text-pink-400",
    badge: "HOT 🔥",
    steps: [
      {
        id: 1,
        title: "BƯỚC 1: TRUY CẬP VIDEO TIKTOK",
        content: "Nhấn vào nút bên dưới để mở video yêu cầu trên ứng dụng TikTok. Đảm bảo bạn đã đăng nhập tài khoản thật.",
        downloadLink: "https://www.tiktok.com/@nhaf.official/video/7565367864157277458",
        buttonText: "👉 MỞ VIDEO TIKTOK"
      },
      {
        id: 2,
        title: "BƯỚC 2: TƯƠNG TÁC ĐẦY ĐỦ",
        content: "Xem hết video (tuyệt đối KHÔNG TUA), nhấn thả tim (Like), Follow kênh và để lại 1 bình luận tích cực trên 10 chữ.",
      },
      {
        id: 3,
        title: "BƯỚC 3: CHỤP MÀN HÌNH BẰNG CHỨNG",
        content: "Chụp lại màn hình cho thấy bạn ĐÃ TIM, ĐÃ FOLLOW và CÓ HIỂN THỊ BÌNH LUẬN của bạn ở phía dưới video.",
      },
      {
        id: 4,
        title: "BƯỚC 4: NỘP BÀI CHỜ DUYỆT",
        content: "Upload ảnh màn hình đó lên mục 'Gửi Bằng Chứng'. Admin sẽ check đối soát và cộng XU cho bạn!"
      }
    ]
  },

  'view-youtube': {
    title: "CÀY VIEW YOUTUBE",
    reward: "30.000 xu",
    color: "text-red-500",
    badge: "HOT 🔥",
    steps: [
      {
        id: 1,
        title: "BƯỚC 1: MỞ VIDEO YOUTUBE",
        content: "Nhấn nút bên dưới để chuyển sang ứng dụng YouTube. (Yêu cầu dùng tài khoản thật, có avatar).",
        downloadLink: "https://www.youtube.com/watch?v=EOhrUX30yjc",
        buttonText: "👉 MỞ VIDEO YOUTUBE"
      },
      {
        id: 2,
        title: "BƯỚC 2: XEM & TƯƠNG TÁC",
        content: "Xem video tối thiểu 3 phút (Nếu video ngắn hơn thì xem hết). Bấm ĐĂNG KÝ KÊNH (Subscribe), LIKE video và viết một bình luận liên quan đến nội dung video.",
      },
      {
        id: 3,
        title: "BƯỚC 3: CHỤP ẢNH XÁC NHẬN",
        content: "Chụp lại màn hình điện thoại hiển thị rõ chữ 'Đã đăng ký', Nút Like đã sáng và thời lượng xem đã qua 3 phút.",
      },
      {
        id: 4,
        title: "BƯỚC 4: GỬI BÁO CÁO",
        content: "Tải ảnh vừa chụp lên hệ thống để xác nhận hoàn thành nhiệm vụ và nhận xu."
      }
    ]
  },

  'post-threads': {
    title: "ĐĂNG BÀI THREADS",
    reward: "30.000 xu",
    color: "text-slate-300",
    badge: "TREND 📈",
    steps: [
      {
        id: 1,
        title: "BƯỚC 1: SAO CHÉP NỘI DUNG BÀI ĐĂNG VÀ TẢI ẢNH",
        content: "Bấm SAO CHÉP để copy nội dung bài đăng. Bấm TẢI ẢNH để lưu ảnh kèm theo về máy, đăng lên Threads cùng nội dung:",
        templates: [
          "Góc khuất học sinh THPT, thức đêm đăng bài thread , đánh giá google map , seeding =))) ít nhưng vẫn cố a",
          "dm đời cuối cùng t cũng kiếm đc job online nghỉ hè rồi , chi tiết phần bình luận",
          "flex ngày hôm nay  : nhận lương từ đăng bài thread , đánh giá google Map , seeding",
          "cần 10 bạn seeding , đăng bài thread , seeding , nếu sợ đảo lửa sẽ bank trước lương"
        ],
        img: "images/anh-thread2.jpg",
        downloadLink: "images/anh-thread2.jpg",
        buttonText: "📥 TẢI ẢNH BÀI ĐĂNG"
      },
      {
        id: 2,
        title: "BƯỚC 2: TẢI ẢNH QR ZALO, ĐĂNG BÀI VÀ GHIM BÌNH LUẬN",
        content: "1. Đăng bài lên Threads với Nội dung bạn vừa Copy.\n2. Bấm nút TẢI ẢNH bên dưới để lưu ảnh Mã QR Zalo về điện thoại.\n3. Bình luận bức ảnh QR đó vào bài viết bạn vừa đăng.",
        img: "images/qr-zalo-nhom6.jpg",
        downloadLink: "images/qr-zalo-nhom6.jpg",
        buttonText: "📥 TẢI MÃ QR ZALO VỀ MÁY"
      },
      {
        id: 3,
        title: "BƯỚC 3: CHỤP ẢNH BẰNG CHỨNG XÁC NHẬN",
        content: "Chụp lại màn hình bài viết Threads của bạn. (Lưu ý: Bức ảnh phải hiển thị rõ NỘI DUNG BÀI ĐĂNG và CẢ PHẦN BÌNH LUẬN CÓ CHỨA ẢNH QR ZALO). Tải ảnh đó lên mục Gửi Bằng Chứng để Admin duyệt Xu."
      }
    ]
  },

  'seeding-vinfast': {
    title: "SEEDING VINFAST",
    reward: "30.000 xu",
    color: "text-cyan-400",
    badge: "DỰ ÁN VIP 💎",
    steps: [
      {
        id: 1,
        title: "BƯỚC 1: TRUY CẬP BÀI VIẾT VINFAST",
        content: "Nhiệm vụ của bạn là hỗ trợ tương tác tích cực cho chiến dịch mới của VinFast. Nhấn nút dưới đây để mở bài viết Fanpage đích.",
        downloadLink: "https://www.facebook.com/photo?fbid=1290890003259251&set=a.562483936099865",
        buttonText: "👉 MỞ BÀI VIẾT"
      },
      {
        id: 2,
        title: "BƯỚC 2: THẢ TIM VÀ BÌNH LUẬN TÍCH CỰC",
        content: "Nhấn thả tim (Tuyệt vời/Thương thương) vào bài viết. Viết một bình luận khen ngợi xe hoặc chiến dịch (VD: Xe đẹp quá, tự hào xe Việt...).",
      },
      {
        id: 3,
        title: "BƯỚC 3: CHỤP ẢNH BẰNG CHỨNG",
        content: "Chụp ảnh màn hình điện thoại hiển thị rõ Icon thả tim và bình luận của bạn nằm trên bài viết đó.",
      },
      {
        id: 4,
        title: "BƯỚC 4: GỬI BÁO CÁO",
        content: "Gửi ảnh lên hệ thống để Admin duyệt tiền ngay nhé."
      }
    ]
  },

  'google-map': {
    title: "GOOGLE MAP",
    reward: "25.000 xu",
    color: "text-cyan-400",
    badge: "CƠ BẢN",
    steps: [
      {
        id: 1,
        title: "TÌM ĐỊA ĐIỂM VINCOM HÀ NỘI",
        content: "Mở Google Maps và tìm kiếm các từ khóa liên quan đến Vincom tại Hà Nội.",
        img: "images/anh-vincom1.jpg"
      },
      {
        id: 2,
        title: "ĐÁNH GIÁ 5 SAO",
        content: "Viết bình luận tốt, tích cực và đăng kèm ảnh chụp địa điểm thực tế.",
        img: "images/anh-vincom2.jpg",
        note: "BÌNH LUẬN TRÊN 15 TỪ ĐỂ ĐƯỢC DUYỆT NHANH."
      },
      {
        id: 3,
        title: "CHỤP LẠI ẢNH BẰNG CHỨNG",
        content: "CHỤP LẠI MÀN HÌNH BÀI ĐÁNH GIÁ ĐÃ ĐĂNG THÀNH CÔNG ĐỂ GỬI."
      }
    ]
  },

  'join-zalo': {
    title: "NHÓM ZALO",
    reward: "10.000 xu",
    color: "text-blue-500",
    badge: "CƠ BẢN",
    steps: [
      {
        id: 1,
        title: "THAM GIA NHÓM ZALO MMO PRO ",
        content: "MỌI NGƯỜI ƯU TIÊN THAM GIA NHÓM SỐ 5 NHÁ .",
        extraLinks: [
          { text: "THAM GIA NHÓM 1 ➔", url: "https://zalo.me/g/zbvsdm567" },
          { text: "THAM GIA NHÓM 2 ➔", url: "https://zalo.me/g/hndtoou23pcp9qhm7dfp" },
          { text: "THAM GIA NHÓM 3 ➔", url: "https://zalo.me/g/lenpfa1wvl7xvrwiihw2" },
          { text: "THAM GIA NHÓM 4 ➔", url: "https://zalo.me/g/ycooilv3vlgg6v1qgt1x" },
          { text: "THAM GIA NHÓM 5 ➔", url: "https://zalo.me/g/cbfjgrygtu5lspswsec2" },
          { text: "THAM GIA NHÓM 6 ➔", url: "https://zalo.me/g/zphocdbaiwzvp6k4bufq" }
        ]
      },
      {
        id: 2,
        title: "CHỤP LẠI ẢNH TRONG NHÓM ZALO ",
        content: "Tải ảnh vừa chụp lên hệ thống để xác nhận hoàn thành nhiệm vụ và nhận xu."
      }
    ]
  },

  // ==============================================
  // NHÓM JOB VIP
  // ==============================================

  'liobank': {
    title: "APP LIOBANK",
    reward: "65.000 xu",
    color: "text-green-400",
    badge: "HOT",
    warning: "BẮT BUỘC TỪ 22 TUỔI! (Nếu chưa đủ tuổi, có thể nhờ người thân đăng ký hộ, vẫn nhận 100% tiền thưởng).",
    steps: [
      {
        id: 1,
        title: "BẮT BUỘC PHẢI CHỌN ĐĂNG KÝ NGAY ",
        content: "Chọn ĐĂNG KÝ NGAY để đăng ký tài khoản .",
        downloadLink: "https://shorten.asia/uEyTE3Sp",
        buttonText: "ĐĂNG KÝ NGAY ➔"
      },
      {
        id: 2,
        title: "CHỌN ĐĂNG KÝ THẺ 2 IN 1",
        content: "Sau khi mở app, chọn mục 'Đăng ký thẻ 2 in 1' để tiến hành mở tài khoản theo hướng dẫn."
      },
      {
        id: 3,
        title: "LÀM THEO HƯỚNG DẪN",
        content: "Thực hiện theo từng bước trong ảnh hướng dẫn bên dưới. Chạm vào ảnh để phóng to.",
        images: [
          "images/anh-liobank3a.jpg",
          "images/anh-liobank3b.jpg"
        ]
      },
      {
        id: 4,
        title: "CHỤP ẢNH THÀNH CÔNG",
        content: "Chụp lại màn hình xác nhận đăng ký thành công và gửi bằng chứng vào hệ thống để nhận xu.",
        img: "images/anh-liobank4.jpg"
      }
    ]
  },

  'app-chung-khoan': {
    title: "APP CHỨNG KHOÁN SỐ 1",
    reward: "85.000 xu",
    color: "text-orange-500",
    badge: "SIÊU HOT",
    warning: "BẮT BUỘC TỪ 18 TUỔI! (Nếu chưa đủ tuổi, có thể nhờ người thân đăng ký hộ, vẫn nhận 100% tiền thưởng).",
    steps: [
      {
        id: 1,
        title: "VÀO CHPLAY HOẶC APPSTORE TẢI APP",
        content: "Tải APP chứng khoán Kafi X về điện thoại theo hình hướng dẫn bên dưới.",
        img: "images/anh-kafi-b1.jpg"
      },
      {
        id: 2,
        title: "ĐĂNG KÝ VÀ NHẬP MÃ GIỚI THIỆU D0020029",
        content: "BẮT BUỘC NHẬP MÃ GIỚI THIỆU D0020029 VÀ CHỤP LẠI ẢNH.",
        img: "images/anh-kafi2.jpg",
        note: "NHẬP MÃ: D0020029 (BẮT BUỘC)",
        referralCode: "D0020029"
      },
      {
        id: 3,
        title: "ĐĂNG KÝ TÀI KHOẢN THÀNH CÔNG",
        content: "CHỤP LẠI ẢNH ĐĂNG NHẬP THÀNH CÔNG ĐỂ GỬI BẰNG CHỨNG.",
        img: "images/anh-kafi3.jpg"
      },
      {
        id: 4,
        title: "LƯU LẠI ẢNH VÀ GỬI",
        content: "GỬI 2 ẢNH ĐÓ VÀ CHỜ PHÊ DUYỆT HOA HỒNG TRONG 24H."
      }
    ]
  },

  'app-chung-khoan-3': {
    title: "APP CHỨNG KHOÁN SỐ 3",
    reward: "85.000 xu",
    color: "text-orange-500",
    badge: "SIÊU HOT",
    warning: "BẮT BUỘC TỪ 20 TUỔI! (Nếu chưa đủ tuổi, có thể nhờ người thân đăng ký hộ, vẫn nhận 100% tiền thưởng).",
    steps: [
      {
        id: 1,
        title: "CHỌN ĐĂNG KÝ NGAY VÀ CHỌN TIẾP TÔI LÀ CÔNG DÂN VIỆT NAM ĐỂ ĐĂNG KÝ",
        content: "LƯU Ý : KHÔNG CHỌN TẢI APP BÊN DƯỚI , PHẢI ĐĂNG KÝ ONLINE TRÊN WEB.",
        downloadLink: "https://shorten.asia/vQxU96N8",
        buttonText: "🚀 ĐĂNG KÝ NGAY",
        img: "images/anh-kis4.jpg"
      },
      {
        id: 2,
        title: "ĐĂNG KÝ VÀ NHẬP MÃ ID MÔI GIỚI: AT03",
        content: "BẮT BUỘC NHẬP MÃ ID MÔI GIỚI AT03 VÀ CHỤP LẠI ẢNH.",
        img: "images/anh-kis1.jpg",
        note: "NHẬP ID MÔI GIỚI AT03 (BẮT BUỘC)",
        referralCode: "AT03"
      },
      {
        id: 3,
        title: "ĐĂNG KÝ TÀI KHOÁN THÀNH CÔNG",
        content: "CHỤP LẠI ẢNH ĐĂNG KÝ TÀI KHOẢN THÀNH CÔNG.",
        img: "images/anh-kis2.jpg"
      },
      {
        id: 4,
        title: "LƯU LẠI ẢNH VÀ GỬI",
        content: "GỬI 2 ẢNH ĐÓ VÀ CHỜ PHÊ DUYỆT HOA HỒNG TRONG 24H."
      }
    ]
  },

  'app-chung-khoan-4': {
    title: "APP CHỨNG KHOÁN SỐ 4",
    reward: "85.000 xu",
    color: "text-orange-500",
    badge: "SIÊU HOT",
    warning: "BẮT BUỘC TỪ 18 TUỔI! (Nếu chưa đủ tuổi, có thể nhờ người thân đăng ký hộ, vẫn nhận 100% tiền thưởng).",
    steps: [
      {
        id: 1,
        title: "VÀO CHPLAY HOẶC APPSTORE TẢI APP",
        content: "Tải APP chứng khoán về điện thoại theo hình hướng dẫn bên dưới.",
        img: "images/anh-maybank1.jpg"
      },
      {
        id: 2,
        title: "ĐĂNG KÝ VÀ NHẬP MÃ GIỚI THIỆU AT09",
        content: "BẮT BUỘC NHẬP MÃ GIỚI THIỆU AT09 VÀ CHỤP LẠI ẢNH.",
        img: "images/anh-maybank2.jpg",
        note: "NHẬP MÃ: AT09 (BẮT BUỘC)",
        referralCode: "AT09"
      },
      {
        id: 3,
        title: "ĐĂNG KÝ TÀI KHOẢN THÀNH CÔNG",
        content: "CHỤP LẠI ẢNH ĐĂNG NHẬP THÀNH CÔNG ĐỂ GỬI BẰNG CHỨNG.",

      },
      {
        id: 4,
        title: "LƯU LẠI ẢNH VÀ GỬI",
        content: "GỬI 2 ẢNH ĐÓ VÀ CHỜ PHÊ DUYỆT HOA HỒNG TRONG 1H."
      }
    ]
  },

  'msb-bank': {
    title: "NGÂN HÀNG MSB",
    reward: "100.000 xu",
    color: "text-orange-500",
    badge: "SIÊU HOT",
    warning: "BẮT BUỘC TỪ 18 TUỔI! (Nếu chưa đủ tuổi, có thể nhờ người thân đăng ký hộ, vẫn nhận 100% tiền thưởng).",
    steps: [
      {
        id: 1,
        title: "TẢI APP MSB MBANK CÁ NHÂN",
        content: "Lưu ý: CHỌN TẢI APP MSB (KHÔNG CÓ CHỮ TÀI TRỢ, QUẢNG CÁO).",
        img: "images/anh-msb1.png"
      },
      {
        id: 2,
        title: "ĐĂNG KÝ VÀ NHẬP MÃ GIỚI THIỆU ACT000",
        content: "BẮT BUỘC NHẬP MÃ GIỚI THIỆU ACT000 VÀ CHỤP LẠI ẢNH.",
        img: "images/anh-msb2.jpg",
        note: "BẮT BUỘC NHẬP MÃ: ACT000 VÀ CHỤP ẢNH LẠI"
      },
      {
        id: 3,
        title: "CHỤP ẢNH BẰNG CHỨNG MỞ TÀI KHOẢN THÀNH CÔNG",
        content: "CHỤP LẠI ẢNH NHƯ BÊN DƯỚI ĐÂY, VÀ ĐĂNG NHẬP VÀO APP MSB ĐỂ HOÀN TẤT.",
        img: "images/anh-msb3.jpg"
      },
      {
        id: 4,
        title: "VÀO CÀI ĐẶT , CHỌN THÔNG TIN CÁ NHÂN , LẤY MÃ CIF MSB ",
        content: "CHỤP ẢNH GỬI VÀO BẰNG CHỨNG .",
        img: "images/anh-msb7.jpg"
      },
    ]
  },

  'vpbank': {
    title: "NGÂN HÀNG VPB",
    reward: "100.000 xu",
    color: "text-orange-500",
    badge: "SIÊU HOT",
    warning: "BẮT BUỘC TỪ 18 TUỔI! (Nếu chưa đủ tuổi, có thể nhờ người thân đăng ký hộ, vẫn nhận 100% tiền thưởng).",
    steps: [
      {
        id: 1,
        title: "TẢI APP VPBANK NEO",
        content: "TẢI ỨNG DỤNG VÀ TIẾN HÀNH ĐĂNG KÝ TÀI KHOẢN TRỰC TUYẾN.",
        img: "images/anh-vpbank1.jpg"
      },
      {
        id: 2,
        title: "NHẬP MÃ GIỚI THIỆU : AT420584",
        content: "BẮT BUỘC NHẬP MÃ GIỚI THIỆU AT420584 VÀ CHỤP LẠI MÀN HÌNH.",
        img: "images/anh-vpbank2.jpg",
        note: "NHẬP MÃ: AT420584 (BẮT BUỘC)"
      },
      {
        id: 3,
        title: "ĐĂNG NHẬP ,  CHUYỂN VÀO VPBANK 20K,  XONG LẠI CHUYỂN RA ",
        content: "Chuyển 20k ra cho 1 người khác , xem ảnh hướng dẫn bên dưới .",
        img: "images/anh-vpbank6.jpg"
      }
    ]
  },

  'app-chung-khoan-2': {
    title: "APP CHỨNG KHOÁN SỐ 2",
    reward: "85.000 xu",
    color: "text-orange-500",
    badge: "SIÊU HOT",
    warning: "BẮT BUỘC TỪ 18 TUỔI! (Nếu chưa đủ tuổi, có thể nhờ người thân đăng ký hộ, vẫn nhận 100% tiền thưởng).",
    steps: [
      {
        id: 1,
        title: "VÀO CHPLAY HOẶC APPSTORE TẢI APP",
        content: "Tải APP chứng khoán DNSE về điện thoại theo hình hướng dẫn bên dưới.",
        img: "images/anh-dnse1.jpg"
      },
      {
        id: 2,
        title: "ĐĂNG KÝ VÀ NHẬP MÃ GIỚI THIỆU AT00007",
        content: "BẮT BUỘC NHẬP MÃ GIỚI THIỆU AT00007 VÀ CHỤP LẠI ẢNH.",
        img: "images/anh-dnse2.jpg",
        note: "NHẬP MÃ: AT00007 (BẮT BUỘC)",
        referralCode: "AT00007"
      },
      {
        id: 3,
        title: "CHỤP LẠI ẢNH ĐĂNG KÝ THÀNH CÔNG VÀ ĐĂNG NHẬP",
        content: "CHỤP LẠI ẢNH ĐĂNG KÝ THÀNH CÔNG HOẶC ẢNH ĐĂNG NHẬP VÀO APP.",
        img: "images/anh-dnse3.jpg",
      },
      {
        id: 4,
        title: "LƯU LẠI ẢNH NHẬP MÃ VÀ ẢNH ĐĂNG KÝ THÀNH CÔNG",
        content: "GỬI 2 ẢNH ĐÓ VÀ CHỜ PHÊ DUYỆT HOA HỒNG."
      }
    ]
  },
};
