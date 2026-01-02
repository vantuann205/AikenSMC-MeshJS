import React, { useState } from "react";
import styles from "../styles/login.module.css";
import { FaGooglePlusG, FaFacebookF, FaGithub, FaLinkedinIn } from "react-icons/fa";
import axios from "axios";
import Swal from "sweetalert2";
import { useRouter } from "next/router";

const Login: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const router = useRouter();

  const handleToggle = () => {
    setIsSignUp(!isSignUp);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post("/api/register", formData);
      if (response.data.success) {
        Swal.fire({
          icon: "success",
          title: "Đăng ký thành công!",
          text: "Vui lòng đăng nhập để tiếp tục.",
          confirmButtonText: "OK",
        });
        setFormData({ name: "", email: "", password: "" });
        setIsSignUp(false);
      }
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "Lỗi",
        text: error.response?.data.error || "Lỗi đăng ký.",
        confirmButtonText: "OK",
      });
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post("/api/login", {
        email: formData.email,
        password: formData.password,
      });
      if (response.data.success) {
        Swal.fire({
          icon: "success",
          title: "Đăng nhập thành công!",
          text: "Chào mừng bạn!",
          confirmButtonText: "OK",
        }).then(() => {
          localStorage.setItem("token", response.data.token);
          router.push("/");
        });
        setFormData({ name: "", email: "", password: "" });
      }
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "Đăng nhập thất bại",
        text: error.response?.data.error || "Lỗi đăng nhập.",
        confirmButtonText: "OK",
      });
    }
  };

  return (
    <div className={styles.web3Wrapper}>
      <video autoPlay loop playsInline muted className={styles.videoBackground}>
        <source src="/videos/hero/ecosystem-desktop_xl.mp4" type="video/mp4" media="(min-width: 1024px)" />
        <source src="/videos/hero/ecosystem-desktop_lg.mp4" type="video/mp4" media="(min-width: 768px)" />
        <source src="/videos/hero/ecosystem-mobile_sm.mp4" type="video/mp4" media="(max-width: 767px)" />
        <img src="/videos/hero/ecosystem-desktop_xl_poster.jpg" alt="Video fallback" />
      </video>
      <div className={styles.content}>
        <h1 className={styles.title}>
          Hello. Wellcome back!
          <div className={styles.aurora}>
            <div className={styles.aurora__item}></div>
            <div className={styles.aurora__item}></div>
            <div className={styles.aurora__item}></div>
            <div className={styles.aurora__item}></div>
          </div>
        </h1>
      </div>

      <div className={`${styles.container} ${isSignUp ? styles.rightPanelActive : ""}`}>
        <div className={`${styles.formContainer} ${styles.signUp}`}>
          <form onSubmit={handleSignUp}>
            <h1>Tạo Tài Khoản</h1>
            <div className={styles.socialIcons}>
              <a href="#" className={styles.icon}>
                <FaGooglePlusG />
              </a>
              <a href="#" className={styles.icon}>
                <FaFacebookF />
              </a>
              <a href="#" className={styles.icon}>
                <FaGithub />
              </a>
              <a href="#" className={styles.icon}>
                <FaLinkedinIn />
              </a>
            </div>
            <span>hoặc sử dụng email để đăng ký</span>
            <input
              type="text"
              name="name"
              placeholder="Tên"
              value={formData.name}
              onChange={handleChange}
            />
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
            />
            <input
              type="password"
              name="password"
              placeholder="Mật Khẩu"
              value={formData.password}
              onChange={handleChange}
            />
            <button type="submit">Đăng Ký</button>
          </form>
        </div>
        <div className={`${styles.formContainer} ${styles.signIn}`}>
          <form onSubmit={handleSignIn}>
            <h1>Đăng Nhập</h1>
            <div className={styles.socialIcons}>
              <a href="#" className={styles.icon}>
                <FaGooglePlusG />
              </a>
              <a href="#" className={styles.icon}>
                <FaFacebookF />
              </a>
              <a href="#" className={styles.icon}>
                <FaGithub />
              </a>
              <a href="#" className={styles.icon}>
                <FaLinkedinIn />
              </a>
            </div>
            <span>hoặc sử dụng email và mật khẩu</span>
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
            />
            <input
              type="password"
              name="password"
              placeholder="Mật Khẩu"
              value={formData.password}
              onChange={handleChange}
            />
            <a href="#">Quên Mật Khẩu?</a>
            <button type="submit">Đăng Nhập</button>
          </form>
        </div>
        <div className={styles.toggleContainer}>
          <div className={styles.toggle}>
            <div className={`${styles.togglePanel} ${styles.toggleLeft}`}>
              <h1>Chào Mừng Trở Lại!</h1>
              <p>Nhập thông tin cá nhân để sử dụng tất cả tính năng của trang</p>
              <button className={styles.hidden} onClick={handleToggle}>
                Đăng Nhập
              </button>
            </div>
            <div className={`${styles.togglePanel} ${styles.toggleRight}`}>
              <h1>Xin Chào!</h1>
              <p>Đăng ký với thông tin cá nhân để sử dụng tất cả tính năng của trang</p>
              <button className={styles.hidden} onClick={handleToggle}>
                Đăng Ký
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;