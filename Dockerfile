# Stage 1: Build the Java project
FROM maven:3.8-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
# Tai xuong cac dependencies truoc (giup cache Docker layer)
RUN mvn dependency:go-offline -B
COPY src ./src
# Build du an thanh file .jar
RUN mvn clean package -DskipTests

# Stage 2: Run the Java application
FROM eclipse-temurin:17-jre
WORKDIR /app
# Thư mục Data sẽ được mount trực tiếp từ bên ngoài vào qua docker-compose để tiết kiệm ổ cứng
# COPY Data ./Data
COPY config.properties .
# Copy file .jar tu stage build
COPY --from=build /app/target/Nso-jar-with-dependencies.jar ./app.jar

EXPOSE 14444
CMD ["java", "-server", "-jar", "-Dfile.encoding=UTF-8", "-Xms512M", "-Xmx1024M", "app.jar"]
