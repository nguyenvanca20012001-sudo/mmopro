// src/data/jobs.ts
export const jobsData: Record<string, any> = {

  // ==============================================
  // NHÓM JOB SEEDING & MARKETING TƯƠNG TÁC
  // ==============================================

  'daily_threads': {
    title: "ĐĂNG BÀI THREAD HẰNG NGÀY",
    reward: "30.000 xu",
    color: "text-purple-300",
    badge: "HẰNG NGÀY",
    steps: []
  },

  'post-threads': {
    title: "ĐĂNG BÀI THREADS",
    reward: "30.000 xu",
    color: "text-slate-300",
    badge: "TREND 📈",
    notice: "⚠️ Yêu cầu đăng 2 bài thread / post với nội dung khác nhau",
    steps: [
      {
        id: 1,
        title: "BƯỚC 1: SAO CHÉP NỘI DUNG BÀI ĐĂNG",
        content: "Bấm COPY NGẪU NHIÊN để nhận 1 mẫu bài đăng.",
        randomTemplates: [
          "Góc khuất học sinh THPT, thức đêm đăng bài thread , đánh giá google map , seeding =))) ít nhưng vẫn cố a",
          "dm đời cuối cùng t cũng kiếm đc job online nghỉ hè rồi , chi tiết phần bình luận",
          "flex ngày hôm nay  : nhận lương từ đăng bài thread , đánh giá google Map , seeding",
          "cần 10 bạn seeding , đăng bài thread , seeding , nếu sợ đảo lửa sẽ bank trước lương",
          "hôm nay rảnh đăng bài thread kiếm thêm vài chục k , ai cần việc bình luận hỏi thêm",
          "nghỉ hè mà ngồi nhà đăng thread làm google map cũng ra tiền , không phải scam nha mn",
          "t vừa rút 200k từ job đăng bài thread + map , ai muốn làm cùng nhắn t",
          "không cần vốn không cần kinh nghiệm , chỉ cần điện thoại là làm được , thread + map + seeding",
          "job sinh viên mùa hè : đăng bài thread , seeding fb , review map , nhận tiền momo hằng ngày",
          "thức đêm làm thêm job online , thread + google map + seeding , mệt mà vui vì có tiền"
        ]
      },
      {
        id: 2,
        title: "BƯỚC 2: TẢI ẢNH BÀI ĐĂNG",
        content: "Bấm TẢI ẢNH để lưu ảnh kèm theo về máy, dùng ảnh này đăng lên Threads cùng nội dung vừa copy ở Bước 1.",
        img: "images/anh-post-5.png",
        downloadLink: "images/anh-post-5.png",
        buttonText: "📥 TẢI ẢNH BÀI ĐĂNG"
      },
      {
        id: 3,
        title: "BƯỚC 3: ĐĂNG BÀI VÀ GHIM MÃ QR DƯỚI BÌNH LUẬN",
        contentHtml: `<span class="text-yellow-400 font-black not-italic">Dưới phần bình luận: kêu gọi mọi người tham gia nhóm</span>, <span class="text-red-400 font-black not-italic">ví dụ: vào nhóm lụm lúa nè mọi người....Rồi ghim mã QR 📌</span>`,
        img: "images/qr-zalo-nhom17.jpg",
        downloadLink: "images/qr-zalo-nhom17.jpg",
        buttonText: "📥 TẢI MÃ QR ZALO VỀ MÁY"
      },
      {
        id: 4,
        title: "BƯỚC 4: CHỤP ẢNH BẰNG CHỨNG XÁC NHẬN",
        content: "Chụp lại màn hình bài viết Threads của bạn. (Lưu ý: Bức ảnh phải hiển thị rõ NỘI DUNG BÀI ĐĂNG và CẢ PHẦN BÌNH LUẬN CÓ CHỨA ẢNH QR ZALO). Tải ảnh đó lên mục Gửi Bằng Chứng để Admin duyệt Xu."
      }
    ]
  },

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
        title: "THAM GIA NHÓM ZALO MMO PRO - GROUP 12",
        content: "CỘNG ĐỒNG MMO PRO GROUP 1- GROUP 11 ĐÃ FULL , THAM GIA GROUP 12 NHÁ  .",
        extraLinks: [
          { text: "THAM GIA NHÓM 12 ➔", url: "https://zalo.me/g/a0vzt8yvoga1f9xhzdkp" }
        ]
      }
    ]
  },

  // ==============================================
  // NHÓM JOB VIP
  // ==============================================

  'liobank': {
    title: "APP LIOBANK",
    ageRequirement: 22,
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

  'app-chung-khoan-3': {
    title: "APP CHỨNG KHOÁN SỐ 3",
    ageRequirement: 20,
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
    ageRequirement: 18,
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

  'lpbank-plus': {
    title: "APP LPBank Plus",
    ageRequirement: 15,
    subtitle: "Mở tài khoản LPBank Plus",
    reward: "85.000 xu",
    color: "text-orange-500",
    badge: "SIÊU HOT",
    warning: "Người đăng ký phải từ 15 tuổi trở lên. Số điện thoại và CCCD/CMND chưa từng đăng ký LPBank Plus trước đó. Phải hoàn tất xác thực tài khoản mới được tính thưởng. Nghiêm cấm gian lận hoặc gửi bằng chứng giả.",
    zaloGuideUrl: "",
    steps: [
      {
        id: 1,
        title: "TẢI ĐÚNG APP LPBANK PLUS - CHÚ Ý CHỮ PLUS ",
        content: "TÊN APP : LPBANK PLUS TẢI ĐÚNG APP HOẶC CHỌN TẢI ỨNG DỤNG.",
        img: "images/anh-lpbank-buoc1.jpg",
      },
      {
        id: 2,
        title: "NHẬP MÃ GIỚI THIỆU",
        contentHtml: `<span class="text-slate-300 font-semibold not-italic">ĐĂNG KÝ VÀ NHẬP MÃ GIỚI THIỆU</span><br/><span class="text-slate-400 font-medium not-italic">Tham gia nhóm Zalo để lấy mã giới thiệu.</span>`,
        extraLinks: [
          { text: "💬 THAM GIA NHÓM ZALO", url: "https://zalo.me/g/shxqdjooiubce1rnvhq8" }
        ],
        img: "images/anh-lpbank-new1.jpg",
        note: "NHẬP MÃ GIỚI THIỆU (BẮT BUỘC)",
      },
      {
        id: 3,
        title: "CHUYỂN VÀO LPBANK PLUS 100K VÀ CHUYỂN RA LẠI",
        content: "CHỤP LẠI ẢNH CHUYỂN TIỀN RA VÀ GỬI BẰNG CHỨNG .",
        img: "images/anh-lpbank-new4.jpg",
      },
      {
        id: 4,
        title: "VÀO GỬI BẰNG CHỨNG ĐỂ XEM ẢNH CẦN GỬI ",
        content: "CHỜ ĐỢI BÊN MÌNH DUYỆT ĐƠN VÀ NHẬN HOA HỒNG .",
        
      },
    ]
  },

  'mbbank': {
    title: "APP ABBANK",
    ageRequirement: 15,
    subtitle: "Mở tài khoản ABBANK",
    reward: "85.000 xu",
    color: "text-orange-500",
    badge: "SIÊU HOT",
    warning: "Người đăng ký phải từ 15 tuổi trở lên. Số điện thoại và CCCD/CMND chưa từng đăng ký MB Bank trước đó. Phải hoàn tất xác thực tài khoản mới được tính thưởng. Nghiêm cấm gian lận hoặc gửi bằng chứng giả.",
    zaloGuideUrl: "",
    steps: [
      {
        id: 1,
        title: "CHỌN NÚT TẢI ỨNG DỤNG VỀ ĐỂ ĐĂNG KÝ ",
        content: " CHỌN TẢI ỨNG DỤNG.",
        downloadLink: "https://retail.abbank.vn/universal-link",
        buttonText: "🚀 TẢI ỨNG DỤNG",
      },
      {
        id: 2,
        title: "NHẬP MÃ GIỚI THIỆU : 0366045803",
        content: "BẮT BUỘC NHẬP MÃ GIỚI THIỆU 0366045803 VÀ CHỤP LẠI ẢNH.",
        img: "images/anh-abbank1.jpg",
        note: "NHẬP MÃ GIỚI THIỆU 0366045803 (BẮT BUỘC)",
        referralCode: "0366045803"
      },
      {
        id: 3,
        title: "ĐĂNG KÝ TÀI KHOÁN THÀNH CÔNG VÀ CHỤP ẢNH LẠI ",
        content: "CHỤP LẠI ẢNH ĐĂNG KÝ TÀI KHOẢN THÀNH CÔNG.",
        img: "images/anh-abbank2.jpg"
      },
      {
        id: 4,
        title: "THỰC HIỆN GIAO DỊCH TỔNG 30K",
        contentHtml: `<span class="text-slate-300 font-semibold not-italic">Sau khi đăng nhập APP ABBANK, bạn cần phát sinh giao dịch 30k theo hướng dẫn dưới đây:</span><br/><br/><span class="text-slate-200 font-bold not-italic">✅ Chuyển vào tài khoản ABBANK: 30k </span><br/><span class="text-slate-200 font-bold not-italic">✅ Chuyển ra ngoài 2 lần 10k : 10k ( lần 1 ) + chuyển ra ngoài 10k ( lần 2 )</span><br/><span class="text-slate-200 font-bold not-italic">✅ Nạp điện thoại: 10k </span><br/><br/><span class="text-yellow-400 font-black not-italic">Tổng cần làm: 30k </span><br/><br/><span class="text-slate-300 font-semibold not-italic">Làm đủ các bước trên rồi chụp ảnh màn hình theo ảnh mẫu để gửi bằng chứng.</span>`,
        img: "images/anh-abbank4.jpg"
      },
    ]
  },

  'referral-hub': {
    title: "GIỚI THIỆU BẠN BÈ",
    reward: "85.000 xu",
    color: "text-amber-400",
    badge: "VIP 💎",
    steps: []
  },
};
