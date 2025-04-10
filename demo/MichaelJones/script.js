// Wait until the document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Chat widget elements
    const chatHeader = document.getElementById('chatHeader');
    const chatBody = document.getElementById('chatBody');
    const chatToggle = document.getElementById('chatToggle');
    const chatSend = document.getElementById('chatSend');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
  
    // Toggle chat widget open/close on header click
    chatHeader.addEventListener('click', function() {
      if (chatBody.style.display === "none" || chatBody.style.display === "") {
        chatBody.style.display = "flex";
        chatToggle.innerText = "−";
      } else {
        chatBody.style.display = "none";
        chatToggle.innerText = "_";
      }
    });
  
    // Handle sending chat messages
    chatSend.addEventListener('click', function() {
      const message = chatInput.value.trim();
      if (message !== "") {
        appendMessage("You", message);
        chatInput.value = "";
  
        // Simulate a reply from Michael after a short delay
        setTimeout(function() {
          appendMessage("Michael", "Thanks for reaching out! I'll get back to you shortly.");
        }, 1000);
      }
    });
  
    // Allow sending a message by pressing Enter
    chatInput.addEventListener('keypress', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        chatSend.click();
      }
    });
  
    // Function to append a message to the chat
    function appendMessage(sender, text) {
      const messageElem = document.createElement('p');
      messageElem.classList.add('chat-message');
      if (sender === "Michael") {
        messageElem.classList.add('bot');
      }
      messageElem.innerHTML = `<strong>${sender}:</strong> ${text}`;
      chatMessages.appendChild(messageElem);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  
    // Handle the contact form submission
    const contactForm = document.getElementById('contactForm');
    contactForm.addEventListener('submit', function(event) {
      event.preventDefault();
      // In a real implementation, you might send data via AJAX.
      alert("Thank you for your message! Michael will get back to you soon.");
      contactForm.reset();
    });
  });
  