(function () {
    const SCROLL_FACTOR = 0.4;

    const postsScroll = document.querySelector('.posts-scroll');
    postsScroll.addEventListener('wheel', function (e) {
        e.preventDefault();
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= postsScroll.clientHeight;
        postsScroll.scrollTop += delta * SCROLL_FACTOR;
    }, { passive: false });

    const messagesScroll = document.querySelector('.private-messages-scroll');
    messagesScroll.addEventListener('wheel', function (e) {
        e.preventDefault();
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= messagesScroll.clientHeight;
        messagesScroll.scrollTop += delta * SCROLL_FACTOR;
    }, { passive: false });

    
    const commentToggles = document.querySelectorAll('.comment-toggle-btn');
    commentToggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const post = btn.closest('.post');
            const commentSection = post.querySelector('.comment-section');

            
            document.querySelectorAll('.comment-section').forEach(section => {
                if (section !== commentSection) {
                    section.style.display = 'none';
                }
            });

            
            commentSection.style.display = commentSection.style.display === 'flex' ? 'none' : 'flex';
        });
    });

    
    const contacts = document.querySelectorAll('.contact');
    const postsSection = document.getElementById('postsSection');
    const privateChat = document.getElementById('privateChatSection');
    const chatContactName = document.getElementById('chatContactName');
    const closeChatBtn = document.getElementById('closeChatBtn');

    let currentChat = null;

    contacts.forEach(contact => {
        contact.addEventListener('click', () => {
            const contactName = contact.textContent;
            if (currentChat === contactName) {
                
                postsSection.style.display = 'flex';
                privateChat.style.display = 'none';
                currentChat = null;
            } else {
                chatContactName.textContent = contactName;
                postsSection.style.display = 'none';
                privateChat.style.display = 'flex';
                currentChat = contactName;
            }
        });
    });

    
    closeChatBtn.addEventListener('click', () => {
        postsSection.style.display = 'flex';
        privateChat.style.display = 'none';
        currentChat = null;
    });

})();
