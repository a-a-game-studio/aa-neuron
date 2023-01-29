
export const dbConf = { // Knex mysql
    client: "mysql2",
    connection: {
        host: "localhost",
        user: "root",
        port:3306,
        password: "****",
        database: "aa_mq"
    },
    pool: { "min": 0, "max": 7 },
    acquireConnectionTimeout: 5000
};


/** Общие настройки приложения */
export const common = {
    env: 'dev', // Тип окружения
    nameApp: 'search_index', // Имя приложения // показываем
    host: '0.0.0.0', // Внутренний host на котором стартует noda слушается обращение к API
    port: 8080, // порт на котором будет работать нода
    host_public: 'https://dev.neuron.ru', // Публичный host балансер к которому идет обращение с фронта
}