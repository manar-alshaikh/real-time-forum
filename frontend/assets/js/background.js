      const container = document.getElementById('galaxy');

        
        for (let i = 0; i < 200; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.top = Math.random() * 100 + '%';
            star.style.left = Math.random() * 100 + '%';
            star.style.width = star.style.height = Math.random() * 2 + 1 + 'px';
            star.style.animationDuration = 1 + Math.random() * 2 + 's';
            container.appendChild(star);
        }
