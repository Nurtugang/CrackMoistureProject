from django.urls import path
from . import views

urlpatterns = [
    # API endpoints
    path('api/detect/', views.detect_defects_endpoint, name='detect_defects'),
    path('api/demo-images/', views.get_demo_images, name='demo_images'),
    path('api/health/', views.health_check, name='health_check'),
    
    # Главная страница
    path('', views.home_view, name='home'),
]