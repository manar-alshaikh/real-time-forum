let signInForm, signUpForm, logoutBtn, imgBtn, cont;
let loginUsername, loginPassword, signInButton;
let registerUsername, registerEmail, registerPassword, confirmPassword, fullName, dob, description;
let genderInputs, profileImage, fileInput;
let usernameError, emailError, passwordError, confirmPasswordError, dobError, genderError, fullnameError;

document.addEventListener('DOMContentLoaded', function () {
    initializeDOMElements();
    setupLogoutButton();
    if (imgBtn) {
        imgBtn.addEventListener('click', function () {
            if (cont) cont.classList.toggle('s-signup');
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    if (profileImage) {
                        profileImage.src = e.target.result;
                        profileImage.style.display = 'block';
                        const defaultIcon = document.querySelector('.default-icon');
                        if (defaultIcon) {
                            defaultIcon.style.display = 'none';
                        }
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }
    if (signInButton) {
        signInButton.addEventListener('click', handleSignIn);
    }
    setupRealTimeValidation();
    checkSession();
    setupEnterKeySupport();
});

function initializeDOMElements() {
    signInForm = document.querySelector('.form.sign-in');
    signUpForm = document.querySelector('.form.sign-up');
    logoutBtn = document.getElementById('logoutBtn');
    imgBtn = document.querySelector('.img-btn');
    cont = document.querySelector('.cont');
    if (signInForm) {
        loginUsername = signInForm.querySelector('input[name="email"]');
        loginPassword = signInForm.querySelector('input[name="password"]');
        signInButton = signInForm.querySelector('.submit');
    }
    registerUsername = document.getElementById('registrationUsername');
    registerEmail = document.getElementById('registrationEmail');
    registerPassword = document.getElementById('registrationPassword');
    confirmPassword = document.getElementById('confirmPassword');
    fullName = document.getElementById('fullname');
    dob = document.getElementById('dob');
    description = document.getElementById('description');
    genderInputs = document.querySelectorAll('input[name="gender"]');
    profileImage = document.getElementById('profileImage');
    fileInput = document.getElementById('fileInput');
    usernameError = document.getElementById('username-error');
    emailError = document.getElementById('email-error');
    passwordError = document.getElementById('password-error');
    confirmPasswordError = document.getElementById('confirmPassword-error');
    dobError = document.getElementById('dob-error');
    genderError = document.getElementById('gender-error');
    fullnameError = document.getElementById('fullname-error');
}

function setupRealTimeValidation() {
    if (registerUsername) {
        registerUsername.addEventListener('input', validateUsernameRealTime);
    }
    if (registerEmail) {
        registerEmail.addEventListener('input', validateEmailRealTime);
    }
    if (registerPassword) {
        registerPassword.addEventListener('input', function () {
            validatePasswordRealTime();
            validateConfirmPasswordRealTime();
        });
    }
    if (confirmPassword) {
        confirmPassword.addEventListener('input', validateConfirmPasswordRealTime);
    }
    if (dob) {
        dob.addEventListener('change', validateDobRealTime);
    }
    if (genderInputs.length > 0) {
        genderInputs.forEach(input => {
            input.addEventListener('change', validateGenderRealTime);
        });
    }
    if (fullName) {
        fullName.addEventListener('input', validateFullNameRealTime);
    }
}

function setupEnterKeySupport() {
    if (loginPassword) {
        loginPassword.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                handleSignIn();
            }
        });
    }
    if (signUpForm) {
        const signUpInputs = signUpForm.querySelectorAll('input:not([type="radio"]):not([type="file"])');
        signUpInputs.forEach(input => {
            input.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    handleSignUp();
                }
            });
        });
    }
}

function validateUsernameRealTime(forceValidation = false) {
    if (!usernameError) return true;
    const value = registerUsername.value.trim();
    let isValid = true;
    if (value.length === 0 && forceValidation) {
        usernameError.textContent = 'Username is required';
        isValid = false;
    } else if (value.length < 2) {
        usernameError.textContent = 'Username must be at least 2 characters';
        isValid = false;
    } else if (value.length > 20) {
        usernameError.textContent = 'Username must be less than 20 characters';
        isValid = false;
    } else if (value.length > 0 && !/^[a-zA-Z0-9_]+$/.test(value)) {
        usernameError.textContent = 'Username can only contain letters, numbers, and underscores';
        isValid = false;
    } else {
        usernameError.textContent = '';
    }
    return isValid;
}

function validateEmailRealTime(forceValidation = false) {
    if (!emailError) return true;
    const value = registerEmail.value.trim();
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    let isValid = true;
    if (value.length === 0 && forceValidation) {
        emailError.textContent = 'Email is required';
        isValid = false;
    } else if (value.length > 0 && !emailRegex.test(value)) {
        emailError.textContent = 'Invalid email address format';
        isValid = false;
    } else if (value.length > 255) {
        emailError.textContent = 'Email must be less than 255 characters';
        isValid = false;
    } else {
        emailError.textContent = '';
    }
    return isValid;
}

function validatePasswordRealTime(forceValidation = false) {
    if (!passwordError) return true;
    const value = registerPassword.value;
    let isValid = true;
    if (value.length === 0 && forceValidation) {
        passwordError.textContent = 'Password is required';
        isValid = false;
    } else if (value.length < 6) {
        passwordError.textContent = 'Password must be at least 6 characters';
        isValid = false;
    } else if (value.length > 50) {
        passwordError.textContent = 'Password must be less than 50 characters';
        isValid = false;
    } else if (value.length > 0) {
        const requirements = {
            lower: /[a-z]/.test(value),
            upper: /[A-Z]/.test(value),
            number: /[0-9]/.test(value),
            special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)
        };
        const metCount = Object.values(requirements).filter(Boolean).length;
        if (metCount < 4) {
            passwordError.textContent = 'Must contain lowercase, uppercase, digits, and special characters';
            isValid = false;
        } else {
            passwordError.textContent = '';
        }
    } else {
        passwordError.textContent = '';
    }
    return isValid;
}

function validateConfirmPasswordRealTime(forceValidation = false) {
    if (!confirmPasswordError) return true;
    const passwordValue = registerPassword.value;
    const confirmValue = confirmPassword.value;
    let isValid = true;
    if (confirmValue.length === 0 && forceValidation) {
        confirmPasswordError.textContent = 'Please confirm your password';
        isValid = false;
    } else if (passwordValue !== confirmValue) {
        confirmPasswordError.textContent = 'Passwords do not match';
        isValid = false;
    } else {
        confirmPasswordError.textContent = '';
    }
    return isValid;
}

function validateDobRealTime(forceValidation = false) {
    if (!dobError) return true;
    const value = dob.value;
    let isValid = true;
    if (!value && forceValidation) {
        dobError.textContent = 'Date of birth is required';
        isValid = false;
    } else if (value) {
        const age = calculateAge(value);
        if (age < 18) {
            dobError.textContent = 'You must be at least 18 years old';
            isValid = false;
        } else if (age > 120) {
            dobError.textContent = 'Invalid date of birth';
            isValid = false;
        } else {
            dobError.textContent = '';
        }
    } else {
        dobError.textContent = '';
    }
    return isValid;
}

function validateGenderRealTime(forceValidation = false) {
    if (!genderError) return true;
    const genderSelected = document.querySelector('input[name="gender"]:checked');
    let isValid = true;
    if (!genderSelected && forceValidation) {
        genderError.textContent = 'Gender is required';
        isValid = false;
    } else {
        genderError.textContent = '';
    }
    return isValid;
}

function validateFullNameRealTime(forceValidation = false) {
    if (!fullnameError) return true;
    const value = fullName.value.trim();
    let isValid = true;
    if (value.length === 0 && forceValidation) {
        fullnameError.textContent = 'Full name is required';
        isValid = false;
    } else if (value.length > 0 && value.split(' ').length < 2) {
        fullnameError.textContent = 'Please enter your full name (first and last name)';
        isValid = false;
    } else if (value.length > 0 && !/^[a-zA-Z\s\-']+$/.test(value)) {
        fullnameError.textContent = 'Full name can only contain letters, spaces, hyphens, and apostrophes';
        isValid = false;
    } else {
        fullnameError.textContent = '';
    }
    return isValid;
}

function validateSignInForm() {
    let isValid = true;
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    const existingErrors = signInForm.querySelectorAll('.error-msg');
    existingErrors.forEach(error => error.remove());
    if (!username) {
        showSignInError('Username or email is required', loginUsername);
        isValid = false;
    }
    if (!password) {
        showSignInError('Password is required', loginPassword);
        isValid = false;
    }
    return isValid;
}

function showSignInError(message, inputElement) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-msg';
    errorElement.textContent = message;
    errorElement.style.color = '#dc3545';
    errorElement.style.fontSize = '0.8em';
    errorElement.style.marginTop = '5px';
    inputElement.parentNode.appendChild(errorElement);
}

function clearSignInErrors() {
    const errors = signInForm.querySelectorAll('.error-msg');
    errors.forEach(error => error.remove());
}

async function handleSignIn() {
    clearSignInErrors();
    if (!validateSignInForm()) {
        return;
    }
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
              credentials: 'include',
            body: JSON.stringify({
                username: username,
                password: password
            })
        });
        const data = await response.json();
        if (data.success) {
            setTimeout(() => {
                showLoggedInState(data.message);
            }, 1000);
        } else {
            showSignInError(data.message || 'Invalid username or password', loginPassword);
        }
    } catch (error) {
        showSignInError('Network error: Could not connect to server', loginPassword);
    }
}

window.handleSignUp = async function () {
    if (!validateSignUpForm()) {
        return;
    }
    const formData = new FormData();
    formData.append('username', registerUsername.value.trim());
    formData.append('email', registerEmail.value.trim());
    formData.append('password', registerPassword.value);
    formData.append('fullname', fullName.value.trim());
    formData.append('dateOfBirth', dob.value);
    formData.append('accountDescription', description.value.trim());
    const selectedGender = document.querySelector('input[name="gender"]:checked');
    if (selectedGender) {
        formData.append('gender', selectedGender.value);
    }
    if (fileInput && fileInput.files[0]) {
        formData.append('profile_picture', fileInput.files[0]);
    }
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
              credentials: 'include',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            setTimeout(() => {
                showLoggedInState(registerUsername.value.trim());
            }, 1000);
        } else {
            showSignInError(data.message || 'Registration failed', registerUsername);
        }
    } catch (error) {
        showSignInError('Network error: Could not connect to server', registerUsername);
    }
}

function validateSignUpForm() {
    let isValid = true;
    if (!validateUsernameRealTime(true)) isValid = false;
    if (!validateEmailRealTime(true)) isValid = false;
    if (!validatePasswordRealTime(true)) isValid = false;
    if (!validateConfirmPasswordRealTime(true)) isValid = false;
    if (!validateDobRealTime(true)) isValid = false;
    if (!validateGenderRealTime(true)) isValid = false;
    if (!validateFullNameRealTime(true)) isValid = false;
    return isValid;
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = handleLogout;
    }
}

async function handleLogout() {
    const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
        showLoggedOutState();
    }
}

window.handleLogout = handleLogout;

async function checkSession() {
    try {
        const response = await fetch('/api/session', {
            credentials: 'include' 
        });
        
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Invalid response from server');
        }
        
        const data = await response.json();
        if (data.success) {
            showLoggedInState(data.message);
        } else {
            showLoggedOutState();
        }
    } catch (error) {
        console.error('Session check failed:', error);
        showLoggedOutState();
    }
}

function showLoggedInState(username) {
    document.body.classList.add('logged-in');
    document.body.classList.remove('logged-out');
    
    const registrationPage = document.getElementById('registration-page');
    if (registrationPage) {
        registrationPage.style.display = 'none';
    }
    
    const mainPage = document.querySelector('.main-page');
    if (mainPage) {
        mainPage.style.display = 'grid';
    }

    
    const privateChatSection = document.getElementById('privateChatSection');
    if (privateChatSection) {
        privateChatSection.style.display = 'none';
    }

    
    const postsSection = document.getElementById('postsSection');
    if (postsSection) {
        postsSection.style.display = 'flex'; 
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = 'block';
    }
    setupLogoutButton();

    setTimeout(() => {
        if (window.contactsManager) {
            console.log('🔄 Refreshing contacts after login...');
            window.contactsManager.initializeUserAndContacts();
        } else {
            console.log('⚠️ Contacts manager not available yet, waiting...');
            setTimeout(() => {
                if (window.contactsManager) {
                    window.contactsManager.initializeUserAndContacts();
                }
            }, 1000);
        }
    }, 500);
    
}

function showLoggedOutState() {
    document.body.classList.add('logged-out');
    document.body.classList.remove('logged-in');
    
    const registrationPage = document.getElementById('registration-page');
    if (registrationPage) {
        registrationPage.style.display = 'flex';
    }
    
    const mainPage = document.querySelector('.main-page');
    if (mainPage) {
        mainPage.style.display = 'none';
    }

    const privateChatSection = document.getElementById('privateChatSection');
    if (privateChatSection) {
        privateChatSection.style.display = 'none';
    }

    const postsSection = document.getElementById('postsSection');
    if (postsSection) {
        postsSection.style.display = 'flex'; 
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = 'none';
    }
    
    
    if (signInForm) {
        clearSignInErrors();
    }
    if (cont) {
        cont.classList.remove('s-signup');
    }
    clearErrors();
    resetProfilePicture();
}


function resetProfilePicture() {
    if (profileImage) {
        profileImage.src = '';
        profileImage.style.display = 'none';
    }
    const defaultIcon = document.querySelector('.default-icon');
    if (defaultIcon) defaultIcon.style.display = 'block';
    if (fileInput) fileInput.value = '';
}

function clearErrors() {
    const errorElements = document.querySelectorAll('.error-msg');
    errorElements.forEach(element => {
        element.textContent = '';
    });
}

function calculateAge(dateString) {
    const today = new Date();
    const birthDate = new Date(dateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}



window.showPrivateChatSection = function () {
    const privateChatSection = document.getElementById('privateChatSection');
    const postsSection = document.getElementById('postsSection');
    
    if (privateChatSection) {
        privateChatSection.style.display = 'block';
    }
    
    if (postsSection) {
        postsSection.style.display = 'none'; 
    }
}

window.hidePrivateChatSection = function () {
    const privateChatSection = document.getElementById('privateChatSection');
    const postsSection = document.getElementById('postsSection');
    
    if (privateChatSection) {
        privateChatSection.style.display = 'none';
    }
    
    if (postsSection) {
        postsSection.style.display = 'flex'; 
    }
}
